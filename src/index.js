'use strict'

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
  _receiveMessage (peerId, incoming) {

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
    this.engine.wantlistForPeer(peerId)
  }

  getBlocks (keys) {
    return this.wm.wantBlocks(keys)
  }

  // removes the given keys from the want list
  cancelWants (keys) {
    this.wm.cancelWants(keys)
  }

  // announces the existance of a block to this service
  hasBlock (blk) {
    throw new Error('Not implemented')
  }

  getWantlist () {
    return this.wm.wl.entries()
  }
}
