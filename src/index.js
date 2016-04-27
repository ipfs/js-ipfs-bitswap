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

    // this.wm.run()
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

  }

  // handle peers being disconnected
  _onPeerDisconnected (peerId) {

  }

  // getBlock attempts to retrieve a particular block with key `k` from peers
  getBlock (k) {
    throw new Error('Not implemented')
  }

  // return the current wantlist for a given peerId `p`
  wantlistForPeer (p) {
    throw new Error('Not implemented')
  }

  // removes the given keys from the want list
  cancelWants (ks) {
    throw new Error('Not implemented')
  }

  // announces the existance of a block to this service
  hasBlock (blk) {
    throw new Error('Not implemented')
  }
}
