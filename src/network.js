'use strict'

const lp = require('it-length-prefixed')
const pipe = require('it-pipe')

const MulticodecTopology = require('libp2p-interfaces/src/topology/multicodec-topology')

const Message = require('./types/message')
const CONSTANTS = require('./constants')
const logger = require('./utils').logger

const BITSWAP100 = '/ipfs/bitswap/1.0.0'
const BITSWAP110 = '/ipfs/bitswap/1.1.0'
const BITSWAP120 = '/ipfs/bitswap/1.2.0'

class Network {
  constructor (libp2p, bitswap, options, stats) {
    this._log = logger(libp2p.peerId, 'network')
    options = options || {}
    this.libp2p = libp2p
    this.bitswap = bitswap
    this.protocols = [BITSWAP100]
    if (!options.b100Only) {
      // Latest bitswap first
      this.protocols.unshift(BITSWAP110)
      this.protocols.unshift(BITSWAP120)
    }

    this._stats = stats
    this._running = false

    // bind event listeners
    this._onPeerConnect = this._onPeerConnect.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
    this._onConnection = this._onConnection.bind(this)
  }

  start () {
    this._running = true
    this.libp2p.handle(this.protocols, this._onConnection)

    // register protocol with topology
    const topology = new MulticodecTopology({
      multicodecs: this.protocols,
      handlers: {
        onConnect: this._onPeerConnect,
        onDisconnect: this._onPeerDisconnect
      }
    })
    this._registrarId = this.libp2p.registrar.register(topology)

    // All existing connections are like new ones for us
    for (const peer of this.libp2p.peerStore.peers.values()) {
      const conn = this.libp2p.connectionManager.get(peer.id)

      conn && this._onPeerConnect(conn.remotePeer)
    }
  }

  stop () {
    this._running = false

    // Unhandle both, libp2p doesn't care if it's not already handled
    this.libp2p.unhandle(this.protocols)

    // unregister protocol and handlers
    this.libp2p.registrar.unregister(this._registrarId)
  }

  /**
   * Handles both types of incoming bitswap messages
   *
   * @private
   * @param {object} param0
   * @param {string} param0.protocol - The protocol the stream is running
   * @param {Stream} param0.stream - A duplex iterable stream
   * @param {Connection} param0.connection - A libp2p Connection
   * @returns {void}
   */
  async _onConnection ({ protocol, stream, connection }) {
    if (!this._running) { return }
    this._log('incoming new bitswap %s connection from %s', protocol, connection.remotePeer.toB58String())

    try {
      await pipe(
        stream,
        lp.decode(),
        async (source) => {
          for await (const data of source) {
            try {
              const message = await Message.deserialize(data.slice())
              await this.bitswap._receiveMessage(connection.remotePeer, message)
            } catch (err) {
              this.bitswap._receiveError(err)
              break
            }
          }
        }
      )
    } catch (err) {
      this._log(err)
    }
  }

  _onPeerConnect (peerId) {
    this.bitswap._onPeerConnected(peerId)
  }

  _onPeerDisconnect (peerId) {
    this.bitswap._onPeerDisconnected(peerId)
  }

  /**
   * Find providers given a `cid`.
   *
   * @param {CID} cid
   * @param {number} maxProviders
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {AsyncIterable<PeerInfo>}
   */
  findProviders (cid, maxProviders, options = {}) {
    return this.libp2p.contentRouting.findProviders(
      cid,
      {
        maxTimeout: CONSTANTS.providerRequestTimeout,
        maxNumProviders: maxProviders,
        signal: options.signal
      }
    )
  }

  /**
   * Find the providers of a given `cid` and connect to them.
   *
   * @param {CID} cid
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {void}
   */
  async findAndConnect (cid, options) {
    const connectAttempts = []
    for await (const provider of this.findProviders(cid, CONSTANTS.maxProvidersPerRequest, options)) {
      this._log(`connecting to provider ${provider.id}`)
      connectAttempts.push(this.connectTo(provider.id, options))
    }
    await Promise.all(connectAttempts)
  }

  /**
   * Tell the network we can provide content for the passed CID
   *
   * @param {CID} cid
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {Promise<void>}
   */
  async provide (cid, options) {
    await this.libp2p.contentRouting.provide(cid, options)
  }

  // Connect to the given peer
  // Send the given msg (instance of Message) to the given peer
  async sendMessage (peer, msg) {
    if (!this._running) throw new Error('network isn\'t running')

    const stringId = peer.toB58String()
    this._log('sendMessage to %s', stringId, msg)

    const { stream, protocol } = await this._dialPeer(peer)

    let serialized
    switch (protocol) {
      case BITSWAP100:
        serialized = msg.serializeToBitswap100()
        break
      case BITSWAP110:
      case BITSWAP120:
        serialized = msg.serializeToBitswap110()
        break
      default:
        throw new Error('Unknown protocol: ' + protocol)
    }

    // Note: Don't wait for writeMessage() to complete
    writeMessage(stream, serialized, this._log)

    this._updateSentStats(peer, msg.blocks)
  }

  /**
   * Connects to another peer
   *
   * @param {PeerId|Multiaddr} peer
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {Promise<Connection>}
   */
  async connectTo (peer, options) { // eslint-disable-line require-await
    if (!this._running) {
      throw new Error('network isn\'t running')
    }

    return this.libp2p.dial(peer, options)
  }

  // Dial to the peer and try to use the most recent Bitswap
  _dialPeer (peer) {
    return this.libp2p.dialProtocol(peer, [BITSWAP120, BITSWAP110, BITSWAP100])
  }

  _updateSentStats (peer, blocks) {
    const peerId = peer.toB58String()

    if (this._stats) {
      blocks.forEach((block) => this._stats.push(peerId, 'dataSent', block.data.length))
      this._stats.push(peerId, 'blocksSent', blocks.size)
    }
  }
}

async function writeMessage (stream, msg, log) {
  try {
    await pipe(
      [msg],
      lp.encode(),
      stream
    )
  } catch (err) {
    log(err)
  }
}

module.exports = Network
