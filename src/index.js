'use strict'

const async = require('async')
const debug = require('debug')
const log = debug('bitswap')
log.error = debug('bitswap:error')
const EventEmitter = require('events').EventEmitter

const cs = require('./constants')
const WantManager = require('./wantmanager')
const Network = require('./network')
const decision = require('./decision')

module.exports = class Bitwap {
  constructor (p, libp2p, datastore, peerBook) {
    // the ID of the peer to act on behalf of
    this.self = p

    // the network delivers messages
    this.network = new Network(libp2p, peerBook, this)

    // local database
    this.datastore = datastore

    this.engine = new decision.Engine(datastore, this.network)

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

      const iblocks = incoming.blocks

      if (iblocks.size === 0) {
        return cb()
      }

      // quickly send out cancels, reduces chances of duplicate block receives
      const keys = []
      for (let block of iblocks.values()) {
        const found = this.wm.wl.contains(block.key)
        if (!found) {
          log('received un-askes-for %s from %s', block.key.toString('hex'), peerId.toB58String())
        } else {
          keys.push(block.key)
        }
      }

      this.wm.cancelWants(keys)

      async.eachLimit(iblocks.values(), 10, (block, next) => {
        async.series([
          (innerCb) => this._updateReceiveCounters(block, (err) => {
            if (err) {
              // ignore, as these have been handled in _updateReceiveCounters
              return innerCb()
            }

            log('got block from %s', peerId.toB58String(), block.data.toString())
            innerCb()
          }),
          (innerCb) => this.hasBlock(block, (err) => {
            if (err) {
              log.error('receiveMessage hasBlock error: %s', err.message)
            }
            innerCb()
          })
        ], next)
      }, cb)
    })
  }

  _updateReceiveCounters (block, cb) {
    this.blocksRecvd ++
    this.datastore.has(block.key, (err, has) => {
      if (err) {
        log('datastore.has error: %s', err.message)
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
    async.retry({times, interval: 400}, (done) => {
      this.datastore.put(block, done)
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

  // getBlock attempts to retrieve a particular block with key `key` from peers
  getBlock (key, cb) {
    log('getBlock.start %s', key.toString('hex'))
    const done = (err, block) => {
      if (err) {
        log('getBlock.fail %s', key.toString('hex'))
      } else {
        log('getBlock.end %s', key.toString('hex'))
      }
      cb(err, block)
    }

    this.getBlocks([key], (err, res) => {
      if (err) {
        return done(err)
      }

      done(null, res[0])
    })
  }

  // return the current wantlist for a given `peerId`
  wantlistForPeer (peerId) {
    return this.engine.wantlistForPeer(peerId)
  }

  getBlocks (keys, cb) {
    const blocks = []
    const finish = (block) => {
      blocks.push(block)
      log('finish: %s/%s', blocks.length, keys.length)
      if (blocks.length === keys.length) {
        cb(null, blocks)
      }
    }

    keys.forEach((key) => {
      // Sanity check, we don't want to announce looking for blocks
      // when we might have them ourselves
      this.datastore.has(key, (err, exists) => {
        if (err) {
          log('error in datastore.has: ', err.message)
          return
        }

        if (exists) {
          this.datastore.get(key, (err, res) => {
            if (!err && res) {
              this.wm.cancelWants([key])
              finish(res)
              return
            }

            if (err) {
              log('error in datastore.get: ', err.message)
            }
          })
        }
      })
      this.notifications.once(`block:${key.toString('hex')}`, (block) => {
        finish(block)
      })
    })

    this.wm.wantBlocks(keys)
  }

  // removes the given keys from the want list
  cancelWants (keys) {
    this.wm.cancelWants(keys)
  }

  // announces the existance of a block to this service
  hasBlock (block, cb) {
    cb = cb || (() => {})

    this._tryPutBlock(block, 4, (err) => {
      if (err) {
        log.error('Error writing block to datastore: %s', err.message)
        return cb(err)
      }
      log('put block: %s', block.key.toString('hex'))
      this.notifications.emit(`block:${block.key.toString('hex')}`, block)
      this.engine.receivedBlock(block)
      cb()
    })
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
  }

  // Halt everything
  stop () {
    this.wm.stop()
    this.network.start()
  }
}
