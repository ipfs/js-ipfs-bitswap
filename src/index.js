'use strict'

const series = require('async/series')
const debug = require('debug')

const log = debug('bitswap')
log.error = debug('bitswap:error')
const EventEmitter = require('events').EventEmitter
const pull = require('pull-stream')
const paramap = require('pull-paramap')
const defer = require('pull-defer/source')
const CID = require('cids')

const CONSTANTS = require('./constants')
const WantManager = require('./components/want-manager')
const Network = require('./components/network')
const DecisionEngine = require('./components/decision-engine')

class Bitswap {
  constructor (libp2p, blockstore, peerBook) {
    this.libp2p = libp2p
    // the network delivers messages
    this.network = new Network(libp2p, peerBook, this)

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(blockstore, this.network)

    // handle message sending
    this.wm = new WantManager(this.network)

    this.blocksRecvd = 0
    this.dupBlocksRecvd = 0
    this.dupDataRecvd = 0

    this.notifications = new EventEmitter()
    this.notifications.setMaxListeners(CONSTANTS.maxListeners)
  }

  // handle messages received through the network
  _receiveMessage (peerId, incoming, cb) {
    cb = cb || (() => {})
    log('receiving message from %s', peerId.toB58String())
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        log('failed to receive message', incoming)
      }

      const cidsAndBlocks = Array
        .from(incoming.blocks.entries())
        .map((entry) => {
          return { cid: new CID(entry[0]), block: entry[1] }
        })

      if (cidsAndBlocks.length === 0) {
        return cb()
      }

      // quickly send out cancels, reduces chances of duplicate block receives
      pull(
        pull.values(cidsAndBlocks),
        pull.filter((cidAndBlock) => this.wm.wantlist.contains(cidAndBlock.cid)),
        pull.collect((err, cidsAndBlocks) => {
          if (err) {
            return log.error(err)
          }
          const cids = cidsAndBlocks.map((entry) => entry.cid)

          this.wm.cancelWants(cids)
        })
      )

      pull(
        pull.values(cidsAndBlocks),
        paramap(this._handleReceivedBlock.bind(this, peerId), 10),
        pull.onEnd(cb)
      )
    })
  }

  _handleReceivedBlock (peerId, cidAndBlock, callback) {
    series([
      (cb) => this._updateReceiveCounters(cidAndBlock.block, (err) => {
        if (err) {
          // ignore, as these have been handled
          // in _updateReceiveCounters
          return cb()
        }

        log('got block from %s', peerId.toB58String(), cidAndBlock.block.data.length)
        cb()
      }),
      (cb) => {
        this.put(cidAndBlock, (err) => {
          if (err) {
            log.error('receiveMessage put error: %s', err.message)
          }
          cb()
        })
      }
    ], callback)
  }

  _updateReceiveCounters (block, callback) {
    this.blocksRecvd++
    block.key((err, key) => {
      if (err) {
        return callback(err)
      }

      this.blockstore.has(key, (err, has) => {
        if (err) {
          log('blockstore.has error: %s', err.message)
          return callback(err)
        }

        if (has) {
          this.dupBlocksRecvd ++
          this.dupDataRecvd += block.data.length
          return callback(new Error('Already have block'))
        }

        callback()
      })
    })
  }

  // handle errors on the receiving channel
  _receiveError (err) {
    log.error('ReceiveError: %s', err.message)
  }

  // handle new peers
  _onPeerConnected (peerId) {
    this.wm.connected(peerId)
  }

  // handle peers being disconnected
  _onPeerDisconnected (peerId) {
    this.wm.disconnected(peerId)
    this.engine.peerDisconnected(peerId)
  }

  // return the current wantlist for a given `peerId`
  wantlistForPeer (peerId) {
    return this.engine.wantlistForPeer(peerId)
  }

  getStream (cids) {
    if (!Array.isArray(cids)) {
      return this._getStreamSingle(cids)
    }

    return pull(
      pull.values(cids),
      paramap((cid, cb) => {
        pull(
          this._getStreamSingle(cid),
          pull.collect(cb)
        )
      }),
      pull.flatten()
    )
  }

  _getStreamSingle (cid) {
    const unwantListeners = {}
    const blockListeners = {}
    const unwantEvent = (cidStr) => `unwant:${cidStr}`
    const blockEvent = (cidStr) => `block:${cidStr}`
    const d = defer()

    const cleanupListener = (cid) => {
      const cidStr = cid.toBaseEncodedString()

      if (unwantListeners[cidStr]) {
        this.notifications.removeListener(unwantEvent(cidStr), unwantListeners[cidStr])
        delete unwantListeners[cidStr]
      }

      if (blockListeners[cidStr]) {
        this.notifications.removeListener(blockEvent(cidStr), blockListeners[cidStr])
        delete blockListeners[cidStr]
      }
    }

    const addListener = (cid) => {
      const cidStr = cid.toBaseEncodedString()
      unwantListeners[cidStr] = () => {
        log(`manual unwant: ${cidStr}`)
        cleanupListener(cid)
        this.wm.cancelWants([cid])
        d.resolve(pull.empty())
      }

      blockListeners[cidStr] = (block) => {
        this.wm.cancelWants([cid])
        cleanupListener(cid)
        d.resolve(pull.values([block]))
      }

      this.notifications.once(unwantEvent(cidStr), unwantListeners[cidStr])
      this.notifications.once(blockEvent(cidStr), blockListeners[cidStr])
    }

    this.blockstore.has(cid.multihash, (err, exists) => {
      if (err) {
        return d.resolve(pull.error(err))
      }
      if (exists) {
        log('already have block', cid.toBaseEncodedString())
        return d.resolve(this.blockstore.getStream(cid.multihash))
      }

      addListener(cid)
      this.wm.wantBlocks([cid])
    })

    return d
  }

  // removes the given cids from the wantlist independent of any ref counts
  unwant (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }

    this.wm.unwantBlocks(cids)
    cids.forEach((cid) => {
      this.notifications.emit(`unwant:${cid.toBaseEncodedString()}`)
    })
  }

  // removes the given keys from the want list
  cancelWants (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }
    this.wm.cancelWants(cids)
  }

  putStream () {
    return pull(
      pull.asyncMap((blockAndCid, cb) => {
        this.blockstore.has(blockAndCid.cid.multihash, (err, exists) => {
          if (err) {
            return cb(err)
          }
          cb(null, [blockAndCid, exists])
        })
      }),
      pull.filter((val) => !val[1]),
      pull.map((val) => {
        const block = val[0].block
        const cid = val[0].cid
        log('putting block')
        return pull(
          pull.values([
            { data: block.data, key: cid.multihash }
          ]),
          this.blockstore.putStream(),
          pull.asyncMap((meta, cb) => {
            log('put block: %s', cid.toBaseEncodedString())
            this.notifications.emit(`block:${cid.toBaseEncodedString()}`, block)
            this.engine.receivedBlock(cid)
            cb(null, meta)
          })
        )
      }),
      pull.flatten()
    )
  }

  // announces the existance of a block to this service
  put (blockAndCid, callback) {
    pull(
      pull.values([blockAndCid]),
      this.putStream(),
      pull.onEnd(callback)
    )
  }

  getWantlist () {
    return this.wm.wantlist.entries()
  }

  stat () {
    return {
      wantlist: this.getWantlist(),
      blocksReceived: this.blocksRecvd,
      dupBlksReceived: this.dupBlocksRecvd,
      dupDataReceived: this.dupDataRecvd,
      peers: this.engine.peers()
    }
  }

  start () {
    this.wm.run()
    this.network.start()
    this.engine.start()
  }

  // Halt everything
  stop () {
    this.wm.stop(this.libp2p.peerInfo.id)
    this.network.stop()
    this.engine.stop()
  }
}

module.exports = Bitswap
