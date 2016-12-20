'use strict'

const waterfall = require('async/waterfall')
const each = require('async/each')
const EventEmitter = require('events').EventEmitter
const pull = require('pull-stream')
const paramap = require('pull-paramap')
const defer = require('pull-defer/source')
const debug = require('debug')

const CONSTANTS = require('./constants')
const WantManager = require('./components/want-manager')
const Network = require('./components/network')
const DecisionEngine = require('./components/decision-engine')

const log = debug('bitswap')
log.error = debug('bitswap:error')

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
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        log('failed to receive message', incoming)
      }

      if (incoming.blocks.size === 0) {
        return cb()
      }

      const cidsAndBlocks = Array.from(incoming.blocks.values())

      // quickly send out cancels, reduces chances of duplicate block receives
      const toCancel = cidsAndBlocks
        .filter((b) => this.wm.wantlist.contains(b.cid))
        .map((b) => b.cid)

      this.wm.cancelWants(toCancel)

      each(
        cidsAndBlocks,
        this._handleReceivedBlock.bind(this, peerId),
        cb
      )
    })
  }

  _handleReceivedBlock (peerId, cidAndBlock, callback) {
    const cid = cidAndBlock.cid
    const block = cidAndBlock.block

    waterfall([
      (cb) => this.blockstore.has(cid.multihash, cb),
      (exists, cb) => {
        this._updateReceiveCounters(block, exists)
        log('got block')

        if (exists) {
          return cb()
        }

        this._putBlockStore(cidAndBlock, cb)
      }
    ], callback)
  }

  _updateReceiveCounters (block, exists) {
    this.blocksRecvd++

    if (exists) {
      this.dupBlocksRecvd ++
      this.dupDataRecvd += block.data.length
    }
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
    const cidStr = cid.buffer.toString()
    const unwantEvent = `unwant:${cidStr}`
    const blockEvent = `block:${cidStr}`

    const d = defer()

    const cleanupListener = () => {
      if (unwantListeners[cidStr]) {
        this.notifications.removeListener(unwantEvent, unwantListeners[cidStr])
        delete unwantListeners[cidStr]
      }

      if (blockListeners[cidStr]) {
        this.notifications.removeListener(blockEvent, blockListeners[cidStr])
        delete blockListeners[cidStr]
      }
    }

    const addListener = () => {
      unwantListeners[cidStr] = () => {
        log(`manual unwant: ${cidStr}`)
        cleanupListener()
        this.wm.cancelWants([cid])
        d.resolve(pull.empty())
      }

      blockListeners[cidStr] = (block) => {
        this.wm.cancelWants([cid])
        cleanupListener(cid)
        d.resolve(pull.values([block]))
      }

      this.notifications.once(unwantEvent, unwantListeners[cidStr])
      this.notifications.once(blockEvent, blockListeners[cidStr])
    }

    this.blockstore.has(cid.multihash, (err, exists) => {
      if (err) {
        return d.resolve(pull.error(err))
      }
      if (exists) {
        log('already have block: %s', cidStr)
        return d.resolve(this.blockstore.getStream(cid.multihash))
      }

      addListener()
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
      this.notifications.emit(`unwant:${cid.buffer.toString()}`)
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
      pull.asyncMap((val, cb) => {
        this._putBlockStore(val[0], cb)
      })
    )
  }

  _putBlockStore (blockAndCid, callback) {
    const block = blockAndCid.block
    const cid = blockAndCid.cid
    const cidStr = cid.buffer.toString()

    log('putting block')

    pull(
      pull.values([{
        data: block.data,
        key: cid.multihash
      }]),
      this.blockstore.putStream(),
      pull.collect((err, meta) => {
        if (err) {
          return callback(err)
        }

        log('put block')
        this.notifications.emit(`block:${cidStr}`, block)
        this.engine.receivedBlocks([cid])
        callback(null, meta)
      })
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
