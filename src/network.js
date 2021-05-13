'use strict'

const lp = require('it-length-prefixed')
const { pipe } = require('it-pipe')

const MulticodecTopology = require('libp2p-interfaces/src/topology/multicodec-topology')

const Message = require('./types/message')
const CONSTANTS = require('./constants')
const logger = require('./utils').logger

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('cids')} CID
 * @typedef {import('multiaddr').Multiaddr} Multiaddr
 * @typedef {import('libp2p-interfaces/src/connection').Connection} Connection
 * @typedef {import('libp2p-interfaces/src/stream-muxer/types').MuxedStream} MuxedStream
 *
 * @typedef {Object} Provider
 * @property {PeerId} id
 * @property {Multiaddr[]} multiaddrs
 *
 * @typedef {Object} Stream
 * @property {AsyncIterable<Uint8Array>} source
 * @property {(output:AsyncIterable<Uint8Array>) => Promise<void>} sink
 */

const BITSWAP100 = '/ipfs/bitswap/1.0.0'
const BITSWAP110 = '/ipfs/bitswap/1.1.0'
const BITSWAP120 = '/ipfs/bitswap/1.2.0'

class Network {
  /**
   * @param {import('libp2p')} libp2p
   * @param {import('./index')} bitswap
   * @param {import('./stats')} stats
   * @param {Object} [options]
   * @param {boolean} [options.b100Only]
   */
  constructor (libp2p, bitswap, stats, options = {}) {
    this._log = logger(libp2p.peerId, 'network')
    this._libp2p = libp2p
    this._bitswap = bitswap
    this._protocols = [BITSWAP100]

    if (!options.b100Only) {
      // Latest bitswap first
      this._protocols.unshift(BITSWAP110)
      this._protocols.unshift(BITSWAP120)
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
    this._libp2p.handle(this._protocols, this._onConnection)

    // register protocol with topology
    const topology = new MulticodecTopology({
      multicodecs: this._protocols,
      handlers: {
        onConnect: this._onPeerConnect,
        onDisconnect: this._onPeerDisconnect
      }
    })
    this._registrarId = this._libp2p.registrar.register(topology)

    // All existing connections are like new ones for us
    for (const peer of this._libp2p.peerStore.peers.values()) {
      const conn = this._libp2p.connectionManager.get(peer.id)

      conn && this._onPeerConnect(conn.remotePeer)
    }
  }

  stop () {
    this._running = false

    // Unhandle both, libp2p doesn't care if it's not already handled
    this._libp2p.unhandle(this._protocols)

    // unregister protocol and handlers
    if (this._registrarId != null) {
      this._libp2p.registrar.unregister(this._registrarId)
    }
  }

  /**
   * Handles both types of incoming bitswap messages
   *
   * @private
   * @param {object} connection
   * @param {string} connection.protocol - The protocol the stream is running
   * @param {MuxedStream} connection.stream - A duplex iterable stream
   * @param {Connection} connection.connection - A libp2p Connection
   */
  async _onConnection ({ protocol, stream, connection }) {
    if (!this._running) { return }
    this._log('incoming new bitswap %s connection from %s', protocol, connection.remotePeer.toB58String())

    try {
      await pipe(
        stream,
        lp.decode(),
        /**
         * @param {AsyncIterable<Uint8Array>} source
         */
        async (source) => {
          for await (const data of source) {
            try {
              const message = await Message.deserialize(data.slice())
              await this._bitswap._receiveMessage(connection.remotePeer, message)
            } catch (err) {
              this._bitswap._receiveError(err)
              break
            }
          }
        }
      )
    } catch (err) {
      this._log(err)
    }
  }

  /**
   * @private
   * @param {PeerId} peerId
   */
  _onPeerConnect (peerId) {
    this._bitswap._onPeerConnected(peerId)
  }

  /**
   * @private
   * @param {PeerId} peerId
   */
  _onPeerDisconnect (peerId) {
    this._bitswap._onPeerDisconnected(peerId)
  }

  /**
   * Find providers given a `cid`.
   *
   * @param {CID} cid
   * @param {number} maxProviders
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {AsyncIterable<Provider>}
   */
  findProviders (cid, maxProviders, options = {}) {
    return this._libp2p.contentRouting.findProviders(
      cid,
      {
        // TODO: Should this be a timeout options insetad ?
        // @ts-expect-error - 'maxTimeout' does not exist in type
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
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async findAndConnect (cid, options) {
    const connectAttempts = []
    for await (const provider of this.findProviders(cid, CONSTANTS.maxProvidersPerRequest, options)) {
      this._log(`connecting to provider ${provider.id}`)
      connectAttempts.push(
        this.connectTo(provider.id, options)
          .catch(err => {
            // Prevent unhandled promise rejection
            this._log.error(err)
          })
      )
    }
    await Promise.all(connectAttempts)
  }

  /**
   * Tell the network we can provide content for the passed CID
   *
   * @param {CID} cid
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async provide (cid, options) {
    // @ts-expect-error - contentRouting takes no options
    await this._libp2p.contentRouting.provide(cid, options)
  }

  /**
   * Connect to the given peer
   * Send the given msg (instance of Message) to the given peer
   *
   * @param {PeerId} peer
   * @param {Message} msg
   */
  async sendMessage (peer, msg) {
    if (!this._running) throw new Error('network isn\'t running')

    const stringId = peer.toB58String()
    this._log('sendMessage to %s', stringId, msg)

    const connection = await this._libp2p.dial(peer)
    const { stream, protocol } = await connection.newStream([BITSWAP120, BITSWAP110, BITSWAP100])

    /** @type {Uint8Array} */
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
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Connection>}
   */
  async connectTo (peer, options) { // eslint-disable-line require-await
    if (!this._running) {
      throw new Error('network isn\'t running')
    }

    return this._libp2p.dial(peer, options)
  }

  /**
   * @private
   * @param {PeerId} peer
   * @param {Map<string, {data:Uint8Array}>} blocks
   */
  _updateSentStats (peer, blocks) {
    const peerId = peer.toB58String()

    if (this._stats) {
      blocks.forEach((block) => this._stats.push(peerId, 'dataSent', block.data.length))
      this._stats.push(peerId, 'blocksSent', blocks.size)
    }
  }
}

/**
 *
 * @param {MuxedStream} stream
 * @param {Uint8Array} msg
 * @param {*} log
 */
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
