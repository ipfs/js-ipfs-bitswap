'use strict'

const async = require('async')
const _ = require('highland')
const debug = require('debug')
const log = debug('bitswap')
log.error = debug('bitswap:error')

// const cs = require('./constants')
const WantManager = require('./wantmanager')
const Network = require('./network')
const decision = require('./decision')

module.exports = class Bitwap {
  constructor (p, libp2p, bstore) {
    // the ID of the peer to act on behalf of
    this.self = p

    // the network delivers messages
    this.network = new Network(libp2p)

    // local database
    this.blockstore = bstore

    // handle message sending
    this.wm = new WantManager(this.network)

    this.engine = new decision.Engine(bstore)

    this.blocksRecvd = 0
    this.dupBlocksRecvd = 0
    this.dupDataRecvd = 0

    this.wm.run()
  }

  // handle messages received through the network
  _receiveMessage (peerId, incoming, cb) {
    console.log('_receiveMessage')
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        log('failed to receive message', incoming)
      }

      const iblocks = incoming.blocks

      if (iblocks.size === 0) {
        return cb()
      }
      console.log('handling blocks')
      // quickly send out cancels, reduces chances of duplicate block receives
      const keys = []
      for (let block of iblocks.values()) {
        const found = this.wm.wl.contains(block.key)
        if (!found) {
          log('received un-askes-for %s from %s', block, peerId)
        } else {
          keys.push(block.key)
        }
      }

      async.eachLimit(iblocks.values(), 10, (block, next) => {
        async.series([
          (innerCb) => this._updateReceiveCounters(block, (err) => {
            if (err) {
              // ignore, as these have been handled in _updateReceiveCounters
              return innerCb()
            }

            console.log('got block')
            log('got block %s from %s', block, peerId)
            innerCb()
          }),
          (innerCb) => this.hasBlock(block, (err) => {
            console.log('finished writing')
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
    this.blockstore.has(block.key, (err, has) => {
      if (err) {
        log('blockstore.has error: %s', err.message)
        return cb(err)
      }

      if (has) {
        this.dupBlocksRecvd ++
        this.dupDataRecvd += block.data.length
        cb(new Error('Already have block'))
      }

      cb()
    })
  }

  _tryPutBlock (block, times, cb) {
    async.retry({times, interval: 400}, (done) => {
      console.log('putting block', block.key, block.data.toString())
      this.blockstore.put(block, done)
    }, cb)
  }

  // handle errors on the receiving channel
  _receiveError (err) {
    log.debug('Bitswap ReceiveError: %s', err.message)
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
    }

    this.getBlocks([key])
      .errors((err) => {
        done(err)
      })
      .toArray((result) => {
        done(null, result[0])
      })
  }

  // return the current wantlist for a given `peerId`
  wantlistForPeer (peerId) {
    return this.engine.wantlistForPeer(peerId)
  }

  getBlocks (keys) {
    return this.wm.wantBlocks(keys)
  }

  // removes the given keys from the want list
  cancelWants (keys) {
    this.wm.cancelWants(keys)
  }

  // announces the existance of a block to this service
  hasBlock (block, cb) {
    this._tryPutBlock(block, 4, (err) => {
      if (err) {
        log.error('Error writing block to datastor: %s', err.message)
        return cb(err)
      }

      // TODO: notify about block
      cb()
    })
  }

  getWantlist () {
    return this.wm.wl.entries()
  }
}
