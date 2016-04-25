'use strict'

const debug = require('debug')
const log = debug('bitswap')
log.error = debug('bitswap:error')

// const cs = require('./constants')
// const WantManager = require('./want-manager')
// const DecisionEngine = require('./decision-engine')

module.exports = class Bitwap {
  constructor (p, network, bstore) {
    // the ID of the peer to act on behalf of
    this.self = p

    // the network delivers messages
    this.network = network

    // local database
    this.blockstore = bstore

    // handle message sending
    // this.wm = new WantManager(network)

    // this.engine = new DecisionEngine(bstore)

    // this.wm.run()
  }

  // handle messages received through the network
  _receiveMessage (p, incoming) {

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
