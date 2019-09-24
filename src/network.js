'use strict'

const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const callbackify = require('callbackify')

const Message = require('./types/message')
const CONSTANTS = require('./constants')
const logger = require('./utils').logger

const BITSWAP100 = '/ipfs/bitswap/1.0.0'
const BITSWAP110 = '/ipfs/bitswap/1.1.0'

class Network {
  constructor (libp2p, bitswap, options, stats) {
    this._log = logger(libp2p.peerInfo.id, 'network')
    options = options || {}
    this.libp2p = libp2p
    this.bitswap = bitswap
    this.b100Only = options.b100Only || false

    this._stats = stats
    this._running = false
  }

  start () {
    this._running = true
    // bind event listeners
    this._onPeerConnect = this._onPeerConnect.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)

    this._onConnection = this._onConnection.bind(this)
    this.libp2p.handle(BITSWAP100, this._onConnection)
    if (!this.b100Only) { this.libp2p.handle(BITSWAP110, this._onConnection) }

    this.libp2p.on('peer:connect', this._onPeerConnect)
    this.libp2p.on('peer:disconnect', this._onPeerDisconnect)

    // All existing connections are like new ones for us
    this.libp2p.peerBook
      .getAllArray()
      .filter((peer) => peer.isConnected())
      .forEach((peer) => this._onPeerConnect((peer)))
  }

  stop () {
    this._running = false

    this.libp2p.unhandle(BITSWAP100)
    if (!this.b100Only) { this.libp2p.unhandle(BITSWAP110) }

    this.libp2p.removeListener('peer:connect', this._onPeerConnect)
    this.libp2p.removeListener('peer:disconnect', this._onPeerDisconnect)
  }

  // Handles both types of bitswap messgages
  _onConnection (protocol, conn) {
    if (!this._running) { return }
    this._log('incomming new bitswap connection: %s', protocol)

    pull(
      conn,
      lp.decode(),
      pull.asyncMap((data, cb) => callbackify(Message.deserialize)(data, cb)),
      pull.asyncMap((msg, cb) => {
        conn.getPeerInfo((err, peerInfo) => {
          if (err) {
            return cb(err)
          }

          callbackify(this.bitswap._receiveMessage.bind(this.bitswap))(peerInfo.id, msg, cb)
        })
      }),
      pull.onEnd((err) => {
        this._log('ending connection')
        if (err) {
          this.bitswap._receiveError(err)
        }
      })
    )
  }

  _onPeerConnect (peerInfo) {
    if (!this._running) { return }

    this.bitswap._onPeerConnected(peerInfo.id)
  }

  _onPeerDisconnect (peerInfo) {
    if (!this._running) { return }

    this.bitswap._onPeerDisconnected(peerInfo.id)
  }

  /**
   * Find providers given a `cid`.
   *
   * @param {CID} cid
   * @param {number} maxProviders
   * @returns {Promise<Result<Array>>}
   */
  findProviders (cid, maxProviders) {
    return this.libp2p.contentRouting.findProviders(
      cid,
      {
        maxTimeout: CONSTANTS.providerRequestTimeout,
        maxNumProviders: maxProviders
      }
    )
  }

  /**
   * Find the providers of a given `cid` and connect to them.
   *
   * @param {CID} cid
   * @returns {void}
   */
  async findAndConnect (cid) {
    const provs = await this.findProviders(cid, CONSTANTS.maxProvidersPerRequest)
    this._log('connecting to providers', provs.map((p) => p.id.toB58String()))
    await Promise.all(provs.map((p) => this.connectTo(p)))
  }

  async provide (cid) {
    await this.libp2p.contentRouting.provide(cid)
  }

  // Connect to the given peer
  // Send the given msg (instance of Message) to the given peer
  async sendMessage (peer, msg) {
    if (!this._running) throw new Error('network isn\'t running')

    const stringId = peer.toB58String() ? peer.toB58String() : peer.id.toB58String()
    this._log('sendMessage to %s', stringId, msg)

    const { conn, protocol } = await this._dialPeer(peer)

    let serialized
    switch (protocol) {
      case BITSWAP100:
        serialized = msg.serializeToBitswap100()
        break
      case BITSWAP110:
        serialized = msg.serializeToBitswap110()
        break
      default:
        throw new Error('Unknown protocol: ' + protocol)
    }

    // Note: Don't wait for writeMessage() to complete
    writeMessage(conn, serialized, this._log)

    this._updateSentStats(peer, msg.blocks)
  }

  /**
   * Connects to another peer
   *
   * @param {PeerInfo|PeerId|Multiaddr} peer
   * @returns {Promise.<Connection>}
   */
  async connectTo (peer) { // eslint-disable-line require-await
    if (!this._running) {
      throw new Error('network isn\'t running')
    }

    return this.libp2p.dial(peer)
  }

  // Dial to the peer and try to use the most recent Bitswap
  async _dialPeer (peer) {
    try {
      // Attempt Bitswap 1.1.0
      return {
        conn: await this.libp2p.dialProtocol(peer, BITSWAP110),
        protocol: BITSWAP110
      }
    } catch (err) {
      // Attempt Bitswap 1.0.0
      return {
        conn: await this.libp2p.dialProtocol(peer, BITSWAP100),
        protocol: BITSWAP100
      }
    }
  }

  _updateSentStats (peer, blocks) {
    const peerId = peer.toB58String()

    if (this._stats) {
      blocks.forEach((block) => this._stats.push(peerId, 'dataSent', block.data.length))
      this._stats.push(peerId, 'blocksSent', blocks.size)
    }
  }
}

function writeMessage (conn, msg, log) {
  pull(
    pull.values([msg]),
    lp.encode(),
    conn.conn,
    pull.onEnd((err) => {
      if (err) {
        log(err)
      }
    })
  )
}

module.exports = Network
