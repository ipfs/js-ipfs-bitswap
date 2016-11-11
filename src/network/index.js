'use strict'

const debug = require('debug')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const setImmediate = require('async/setImmediate')

const Message = require('../message')
const cs = require('../constants')
const log = debug('bitswap:network')
log.error = debug('bitswap:network:error')

const PROTOCOL_IDENTIFIER = '/ipfs/bitswap/1.0.0'

module.exports = class Network {
  constructor (libp2p, peerBook, bitswap) {
    this.libp2p = libp2p
    this.peerBook = peerBook
    this.bitswap = bitswap
    this.conns = new Map()

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

  _onConnection (protocol, conn) {
    log('incomming new bitswap connection: %s', protocol)
    pull(
      conn,
      lp.decode(),
      pull.asyncMap((data, cb) => Message.fromProto(data, cb)),
      pull.asyncMap((msg, cb) => {
        conn.getPeerInfo((err, peerInfo) => {
          if (err) {
            return cb(err)
          }
          log('data from', peerInfo.id.toB58String())
          this.bitswap._receiveMessage(peerInfo.id, msg)
          cb()
        })
      }),
      pull.onEnd((err) => {
        log('ending connection')
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
    const stringId = peerId.toB58String()
    log('sendMessage to %s', stringId)
    let peerInfo
    try {
      peerInfo = this.peerBook.getByMultihash(peerId.toBytes())
    } catch (err) {
      return cb(err)
    }

    if (this.conns.has(stringId)) {
      log('connection exists')
      this.conns.get(stringId).push(msg.toProto())
      return cb()
    }

    log('dialByPeerInfo')
    this.libp2p.dialByPeerInfo(peerInfo, PROTOCOL_IDENTIFIER, (err, conn) => {
      log('dialed %s', peerInfo.id.toB58String(), err)
      if (err) {
        return cb(err)
      }

      const msgQueue = pushable()
      msgQueue.push(msg.toProto())

      this.conns.set(stringId, msgQueue)

      pull(
        msgQueue,
        lp.encode(),
        conn,
        pull.onEnd((err) => {
          if (err) {
            log.error(err)
          }
          msgQueue.end()
          this.conns.delete(stringId)
        })
      )

      cb()
    })
  }
}
