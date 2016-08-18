'use strict'

const series = require('async/series')
const retry = require('async/retry')
const debug = require('debug')
const log = debug('bitswap')
log.error = debug('bitswap:error')
const EventEmitter = require('events').EventEmitter
const mh = require('multihashes')
const pull = require('pull-stream')
const paramap = require('pull-paramap')
const defer = require('pull-defer/source')

const cs = require('./constants')
const WantManager = require('./wantmanager')
const Network = require('./network')
const decision = require('./decision')

module.exports = class Bitwap {
  constructor (p, libp2p, blockstore, peerBook) {
    // the ID of the peer to act on behalf of
    this.self = p

    // the network delivers messages
    this.network = new Network(libp2p, peerBook, this)

    // local database
    this.blockstore = blockstore

    this.engine = new decision.Engine(blockstore, this.network)

    // handle message sending
    this.wm = new WantManager(this.network)

    this.blocksRecvd = 0
    this.dupBlocksRecvd = 0
    this.dupDataRecvd = 0

    this.notifications = new EventEmitter()
    this.notifications.setMaxListeners(cs.maxListeners)
  }

  // handle messages received through the network
  _receiveMessage (peerId, incoming, cb) {
    cb = cb || (() => {})
    log('receiving message from %s', peerId.toB58String())
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        log('failed to receive message', incoming)
      }

      const iblocks = Array.from(incoming.blocks.values())

      if (iblocks.length === 0) {
        return cb()
      }

      // quickly send out cancels, reduces chances of duplicate block receives

      pull(
        pull.values(iblocks),
        pull.map((block) => block.key),
        pull.filter((key) => this.wm.wl.contains(key)),
        pull.collect((err, keys) => {
          if (err) {
            return log.error(err)
          }
          this.wm.cancelWants(keys)
        })
      )

      pull(
        pull.values(iblocks),
        paramap(this._handleReceivedBlock.bind(this, peerId), 10),
        pull.onEnd(cb)
      )
    })
  }

  _handleReceivedBlock (peerId, block, cb) {
    log('handling block', block)
    series([
      (cb) => this._updateReceiveCounters(block, (err) => {
        if (err) {
          // ignore, as these have been handled
          // in _updateReceiveCounters
          return cb()
        }

        log('got block from %s', peerId.toB58String(), block.data.toString())
        cb()
      }),
      (cb) => this.put(block, (err) => {
        if (err) {
          log.error('receiveMessage put error: %s', err.message)
        }
        cb()
      })
    ], cb)
  }

  _updateReceiveCounters (block, cb) {
    this.blocksRecvd ++
    this.blockstore.has(block.key, (err, has) => {
      if (err) {
        log('blockstore.has error: %s', err.message)
        return cb(err)
      }

      if (has) {
        this.dupBlocksRecvd ++
        this.dupDataRecvd += block.data.length
        return cb(new Error('Already have block'))
      }

      cb()
    })
  }

  _tryPutBlock (block, times, cb) {
    log('trying to put block %s', block.data.toString())
    retry({times, interval: 400}, (done) => {
      pull(
        pull.values([block]),
        this.blockstore.putStream(),
        pull.onEnd(done)
      )
    }, cb)
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

  getStream (keys) {
    if (!Array.isArray(keys)) {
      return this._getStreamSingle(keys)
    }

    return pull(
      pull.values(keys),
      paramap((key, cb) => {
        pull(
          this._getStreamSingle(key),
          pull.collect(cb)
        )
      }),
      pull.flatten()
    )
  }

  _getStreamSingle (key) {
    const unwantListeners = {}
    const blockListeners = {}
    const unwantEvent = (key) => `unwant:${key}`
    const blockEvent = (key) => `block:${key}`
    const d = defer()

    const cleanupListener = (key) => {
      const keyS = mh.toB58String(key)

      if (unwantListeners[keyS]) {
        this.notifications.removeListener(unwantEvent(keyS), unwantListeners[keyS])
        delete unwantListeners[keyS]
      }

      if (blockListeners[keyS]) {
        this.notifications.removeListener(blockEvent(keyS), blockListeners[keyS])
        delete blockListeners[keyS]
      }
    }

    const addListener = (key) => {
      const keyS = mh.toB58String(key)
      unwantListeners[keyS] = () => {
        log(`manual unwant: ${keyS}`)
        cleanupListener(key)
        this.wm.cancelWants([key])
        d.resolve(pull.empty())
      }

      blockListeners[keyS] = (block) => {
        this.wm.cancelWants([block.key])
        cleanupListener(key)
        d.resolve(pull.values([block]))
      }

      this.notifications.once(unwantEvent(keyS), unwantListeners[keyS])
      this.notifications.once(blockEvent(keyS), blockListeners[keyS])
    }

    this.blockstore.has(key, (err, exists) => {
      if (err) {
        return d.resolve(pull.error(err))
      }
      if (exists) {
        return d.resolve(this.blockstore.getStream(key))
      }

      addListener(key)
      this.wm.wantBlocks([key])
    })

    return d
  }

  // removes the given keys from the want list independent of any ref counts
  unwant (keys) {
    if (!Array.isArray(keys)) {
      keys = [keys]
    }

    this.wm.unwantBlocks(keys)
    keys.forEach((key) => {
      this.notifications.emit(`unwant:${mh.toB58String(key)}`)
    })
  }

  // removes the given keys from the want list
  cancelWants (keys) {
    if (!Array.isArray(keys)) {
      keys = [keys]
    }
    this.wm.cancelWants(keys)
  }

  putStream () {
    return pull(
      pull.asyncMap((block, cb) => {
        this.blockstore.has(block.key, (err, exists) => {
          if (err) return cb(err)
          cb(null, [block, exists])
        })
      }),
      pull.filter((val) => !val[1]),
      pull.map((val) => {
        const block = val[0]

        return pull(
          pull.values([block]),
          this.blockstore.putStream(),
          pull.through((meta) => {
            const key = block.key
            log('put block: %s', mh.toB58String(key))
            this.notifications.emit(`block:${mh.toB58String(key)}`, block)
            this.engine.receivedBlock(key)
          })
        )
      }),
      pull.flatten()
    )
  }

  // announces the existance of a block to this service
  put (block, cb) {
    pull(
      pull.values([block]),
      this.putStream(),
      pull.onEnd(cb)
    )
  }

  getWantlist () {
    return this.wm.wl.entries()
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
    this.wm.stop()
    this.network.stop()
    this.engine.stop()
  }
}
