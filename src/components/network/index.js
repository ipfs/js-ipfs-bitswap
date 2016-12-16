'use strict'

const debug = require('debug')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const setImmediate = require('async/setImmediate')

const Message = require('../../types/message')
const CONSTANTS = require('../../constants')
const log = debug('bitswap:network')
log.error = debug('bitswap:network:error')

const BITSWAP100 = '/ipfs/bitswap/1.0.0'
// const BITSWAP110 = '/ipfs/bitswap/1.0.0'

class Network {
  constructor (libp2p, peerBook, bitswap) {
    this.libp2p = libp2p
    this.peerBook = peerBook
    this.bitswap = bitswap
    this.conns = new Map()

    // increase event listener max
    this.libp2p.swarm.setMaxListeners(CONSTANTS.maxListeners)
  }

  start () {
    // bind event listeners
    this._onConnectionBitswap100 = this._onConnectionBitswap100.bind(this)
    // this._onConnectionBitswap110 = this._onConnectionBitswap100.bind(this)

    this._onPeerMux = this._onPeerMux.bind(this)
    this._onPeerMuxClosed = this._onPeerMuxClosed.bind(this)

    this.libp2p.handle(BITSWAP100, this._onConnectionBitswap100)
    // this.libp2p.handle(BITSWAP110, this._onConnectionBitswap110)

    this.libp2p.swarm.on('peer-mux-established', this._onPeerMux)
    this.libp2p.swarm.on('peer-mux-closed', this._onPeerMuxClosed)

    // All existing connections are like new ones for us
    const pKeys = Object.keys(this.peerBook.getAll())
    pKeys.forEach((k) => {
      this._onPeerMux(this.peerBook.getByB58String(k))
    })
  }

  stop () {
    this.libp2p.unhandle(BITSWAP100)
    // this.libp2p.unhandle(BITSWAP110)
    this.libp2p.swarm.removeListener('peer-mux-established', this._onPeerMux)
    this.libp2p.swarm.removeListener('peer-mux-closed', this._onPeerMuxClosed)
  }

  _onConnectionBitswap100 (protocol, conn) {
    log('incomming new bitswap connection: %s', protocol)
    pull(
      conn,
      lp.decode(),
      pull.asyncMap((data, cb) => Message.deserialize(data, cb)),
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

  _onConnectionBitswap110 (protocol, conn) {

  }

  _onPeerMux (peerInfo) {
    this.bitswap._onPeerConnected(peerInfo.id)
  }

  _onPeerMuxClosed (peerInfo) {
    this.bitswap._onPeerDisconnected(peerInfo.id)
  }

  // Connect to the given peer
  connectTo (peerId, callback) {
    log('connecting to %s', peerId.toB58String())
    const done = (err) => setImmediate(() => callback(err))
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
  sendMessage (peerId, msg, callback) {
    const stringId = peerId.toB58String()
    log('sendMessage to %s', stringId)
    let peerInfo
    try {
      peerInfo = this.peerBook.getByMultihash(peerId.toBytes())
    } catch (err) {
      return callback(err)
    }

    if (this.conns.has(stringId)) {
      log('connection exists')
      this.conns.get(stringId).push(msg.serializeToBitswap100())
      return callback()
    }

    log('dialByPeerInfo')
    // TODO
    //   upgrade to first try BITSWAP110 and then BITSWAP100
    this.libp2p.dialByPeerInfo(peerInfo, BITSWAP100, (err, conn) => {
      log('dialed %s', peerInfo.id.toB58String(), err)
      if (err) {
        return callback(err)
      }

      // TODO fix: this is not a messageQueue
      const msgQueue = pushable()
      msgQueue.push(msg.serializeToBitswap100())

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

      callback()
    })
  }
}

module.exports = Network
