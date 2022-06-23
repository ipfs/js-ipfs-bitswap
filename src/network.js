import * as lp from 'it-length-prefixed'
import { pipe } from 'it-pipe'
import { createTopology } from '@libp2p/topology'
import { BitswapMessage as Message } from './message/index.js'
import * as CONSTANTS from './constants.js'
import { logger } from './utils/index.js'

/**
 * @typedef {import('@libp2p/interfaces/peer-id').PeerId} PeerId
 * @typedef {import('multiformats').CID} CID
 * @typedef {import('@multiformats/multiaddr').Multiaddr} Multiaddr
 * @typedef {import('@libp2p/interfaces/connection').Connection} Connection
 * @typedef {import('@libp2p/interfaces/connection').Stream} Stream
 * @typedef {import('./types').MultihashHasherLoader} MultihashHasherLoader
 *
 * @typedef {object} Provider
 * @property {PeerId} id
 * @property {Multiaddr[]} multiaddrs
 *
 * @typedef {import('it-stream-types').Duplex<Uint8Array>} Duplex
 */

const BITSWAP100 = '/ipfs/bitswap/1.0.0'
const BITSWAP110 = '/ipfs/bitswap/1.1.0'
const BITSWAP120 = '/ipfs/bitswap/1.2.0'

export class Network {
  /**
   * @param {import('libp2p').Libp2p} libp2p
   * @param {import('./bitswap').Bitswap} bitswap
   * @param {import('./stats').Stats} stats
   * @param {object} [options]
   * @param {boolean} [options.b100Only]
   * @param {MultihashHasherLoader} [options.hashLoader]
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
    this._hashLoader = options.hashLoader
  }

  async start () {
    this._running = true
    await this._libp2p.handle(this._protocols, this._onConnection)

    // register protocol with topology
    const topology = createTopology({
      onConnect: this._onPeerConnect,
      onDisconnect: this._onPeerDisconnect
    })
    this._registrarId = await this._libp2p.registrar.register(this._protocols, topology)

    // All existing connections are like new ones for us
    this._libp2p.getConnections().forEach(conn => {
      this._onPeerConnect(conn.remotePeer)
    })
  }

  async stop () {
    this._running = false

    // Unhandle both, libp2p doesn't care if it's not already handled
    await this._libp2p.unhandle(this._protocols)

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
   * @param {Stream} connection.stream - A duplex iterable stream
   * @param {Connection} connection.connection - A libp2p Connection
   */
  _onConnection ({ protocol, stream, connection }) {
    if (!this._running) {
      return
    }

    Promise.resolve().then(async () => {
      this._log('incoming new bitswap %s connection from %p', protocol, connection.remotePeer)

      await pipe(
        stream,
        lp.decode(),
        async (source) => {
          for await (const data of source) {
            try {
              const message = await Message.deserialize(data.slice(), this._hashLoader)
              await this._bitswap._receiveMessage(connection.remotePeer, message)
            } catch (/** @type {any} */ err) {
              this._bitswap._receiveError(err)
              break
            }
          }
        }
      )
    })
      .catch(err => {
        this._log(err)
      })
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
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {AsyncIterable<Provider>}
   */
  findProviders (cid, options = {}) {
    return this._libp2p.contentRouting.findProviders(cid, options)
  }

  /**
   * Find the providers of a given `cid` and connect to them.
   *
   * @param {CID} cid
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async findAndConnect (cid, options) {
    const connectAttempts = []
    let found = 0

    for await (const provider of this.findProviders(cid, options)) {
      this._log(`connecting to provider ${provider.id}`)
      connectAttempts.push(
        this.connectTo(provider.id, options)
          .catch(err => {
            // Prevent unhandled promise rejection
            this._log.error(err)
          })
      )

      found++

      if (found === CONSTANTS.maxProvidersPerRequest) {
        break
      }
    }

    await Promise.all(connectAttempts)
  }

  /**
   * Tell the network we can provide content for the passed CID
   *
   * @param {CID} cid
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async provide (cid, options) {
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

    const stringId = peer.toString()
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
   * @param {object} [options]
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
   * @param {Map<string, Uint8Array>} blocks
   */
  _updateSentStats (peer, blocks) {
    const peerId = peer.toString()

    if (this._stats) {
      for (const block of blocks.values()) {
        this._stats.push(peerId, 'dataSent', block.length)
      }

      this._stats.push(peerId, 'blocksSent', blocks.size)
    }
  }
}

/**
 *
 * @param {Stream} stream
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
