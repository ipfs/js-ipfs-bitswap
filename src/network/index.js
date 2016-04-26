'use strict'

module.exports = class Network {
  constructor (libp2p) {
    // TODO: Implement me
    this.libp2p = libp2p
  }

  // Connect to the given peer
  connectTo (peerId, cb) {
    // TODO: Implement me
  }

  // Send the given msg (instance of Message) to the given peer
  sendMessage (peerId, msg, cb) {
    // TODO: Implement me
  }
}
