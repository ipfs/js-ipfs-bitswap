'use strict'

const debug = require('debug')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')

const Message = require('../message')
const cs = require('../constants')
const log = debug('bitswap:network')

const PROTOCOL_IDENTIFIER = '/ipfs/bitswap/1.0.0'

module.exports = class Network {
  constructor (libp2p, peerBook, bitswap) {
    this.libp2p = libp2p
    this.peerBook = peerBook
    this.bitswap = bitswap

    // increase event listener max
    this.libp2p.swarm.setMaxListeners(cs.maxListeners)
  }

  start () {
    // bind event listeners
    this._onConnection = this._onConnection.bind(this)
    this._onPeerMux = this._onPeerMux.bind(this)
    this._onPeerMuxClosed = this._onPeerMuxClosed.bind(this)

    this.libp2p.handle(PROTOCOL_IDENTIFIER, this._onConnection)

    this.libp2p.swarm.on('peer-mux-established', this._onPeerMux)

    this.libp2p.swarm.on('peer-mux-closed', this._onPeerMuxClosed)

    // All existing connections are like new ones for us
    const pKeys = Object.keys(this.peerBook.getAll())
    pKeys.forEach((k) => {
      this._onPeerMux(this.peerBook.getByB58String(k))
    })
  }

  stop () {
    this.libp2p.unhandle(PROTOCOL_IDENTIFIER)
    this.libp2p.swarm.removeListener('peer-mux-established', this._onPeerMux)

    this.libp2p.swarm.removeListener('peer-mux-closed', this._onPeerMuxClosed)
  }

  _onConnection (conn) {
    log('incomming new bitswap connection')
    pull(
      conn,
      lp.decode(),
      pull.through((data) => {
        let msg
        try {
          msg = Message.fromProto(data)
        } catch (err) {
          return this.bitswap._receiveError(err)
        }
        conn.getPeerInfo((err, peerInfo) => {
          if (err) {
            return this.bitswap._receiveError(err)
          }
          this.bitswap._receiveMessage(peerInfo.id, msg)
        })
      }),
      pull.onEnd((err) => {
        if (err) {
          return this.bitswap._receiveError(err)
        }
      })
    )
  }

  _onPeerMux (peerInfo) {
    this.bitswap._onPeerConnected(peerInfo.id)
  }

  _onPeerMuxClosed (peerInfo) {
    this.bitswap._onPeerDisconnected(peerInfo.id)
  }

  // Connect to the given peer
  connectTo (peerId, cb) {
    log('connecting to %s', peerId.toB58String())
    const done = (err) => setImmediate(() => cb(err))
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
    log('sendMessage to %s', peerId.toB58String())
    log('msg', msg)
    let peerInfo
    try {
      peerInfo = this.peerBook.getByMultihash(peerId.toBytes())
    } catch (err) {
      return cb(err)
    }

    this.libp2p.dialByPeerInfo(peerInfo, PROTOCOL_IDENTIFIER, (err, conn) => {
      log('dialed %s', peerInfo.id.toB58String(), err)
      if (err) {
        return cb(err)
      }
      pull(
        pull.values([msg.toProto()]),
        lp.encode(),
        conn
      )
      cb()
    })
  }
}
