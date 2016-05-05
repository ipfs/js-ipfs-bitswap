'use strict'

const bl = require('bl')
const async = require('async')
const Message = require('../message')

module.exports = class Network {
  constructor (libp2p, peerBook, bitswap) {
    this.libp2p = libp2p
    this.peerBook = peerBook
    this.bitswap = bitswap

    this._attachSwarmListeners()
  }

  _attachSwarmListeners () {
    this.libp2p.swarm.handle('/ipfs/bitswap/1.0.0', this._onConnection.bind(this))

    this.libp2p.swarm.on('peer-mux-established', this._onPeerMux.bind(this))

    this.libp2p.swarm.on('peer-mux-closed', this._onPeerMuxClosed.bind(this))
  }

  _onConnection (conn) {
    conn.pipe(bl((err, data) => {
      conn.end()
      if (err) {
        return this.bitswap._receiveError(err)
      }
      let msg
      try {
        msg = Message.fromProto(data)
      } catch (err) {
        return this.bitswap._receiveError(err)
      }
      this.bitswap._receiveMessage(conn.peerId, msg)
    }))
  }

  _onPeerMux (peerInfo) {
    this.bitswap._onPeerConnected(peerInfo.id)
  }

  _onPeerMuxClosed (peerInfo) {
    this.bitswap._onPeerDisconnected(peerInfo.id)
  }

  // Connect to the given peer
  connectTo (peerId, cb) {
    const done = (err) => async.setImmediate(() => cb(err))
    // NOTE: For now, all this does is ensure that we are
    // connected. Once we have Peer Routing, we will be able
    // to find the Peer
    if (this.libp2p.swarm.muxedConns[peerId.toB58String()]) {
      done()
    } else {
      done(new Error('Could not connect to peer with peerId:', peerId.toB58String()))
    }
  }

  // Send the given msg (instance of Message) to the given peer
  sendMessage (peerId, msg, cb) {
    const done = (err) => async.setImmediate(() => cb(err))
    let peerInfo
    try {
      peerInfo = this.peerBook.getByMultihash(peerId.toBytes())
    } catch (err) {
      return done(err)
    }

    const conn = this.libp2p.swarm.dial(peerInfo, '/ipfs/bitswap/1.0.0', (err) => {
      if (err) {
        return done(err)
      }

      conn.write(msg.toProto())
      conn.once('error', (err) => done(err))
      conn.once('end', done)
      conn.end()
    })
  }
}
