import { WantManager } from './want-manager/index.js'
import { Network } from './network.js'
import { DecisionEngine } from './decision-engine/index.js'
import { Notifications } from './notifications.js'
import { logger } from './utils/index.js'
import { Stats } from './stats/index.js'
import { anySignal } from 'any-signal'
import { BaseBlockstore } from 'blockstore-core/base'
import { CID } from 'multiformats/cid'

/**
 * @typedef {import('./types').IPFSBitswap} IPFSBitswap
 * @typedef {import('./types').MultihashHasherLoader} MultihashHasherLoader
 * @typedef {import('./message').BitswapMessage} BitswapMessage
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 * @typedef {import('interface-blockstore').Blockstore} Blockstore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('interface-blockstore').Options} Options
 */

const defaultOptions = {
  statsEnabled: false,
  statsComputeThrottleTimeout: 1000,
  statsComputeThrottleMaxQueueSize: 1000
}
const statsKeys = [
  'blocksReceived',
  'dataReceived',
  'dupBlksReceived',
  'dupDataReceived',
  'blocksSent',
  'dataSent',
  'providesBufferLength',
  'wantListLength',
  'peerCount'
]

/**
 * JavaScript implementation of the Bitswap 'data exchange' protocol
 * used by IPFS.
 *
 * @implements {IPFSBitswap}
 */
export class Bitswap extends BaseBlockstore {
  /**
   * @param {import('@libp2p/interface-libp2p').Libp2p} libp2p
   * @param {Blockstore} blockstore
   * @param {object} [options]
   * @param {boolean} [options.statsEnabled=false]
   * @param {number} [options.statsComputeThrottleTimeout=1000]
   * @param {number} [options.statsComputeThrottleMaxQueueSize=1000]
   * @param {number} [options.maxInboundStreams=32]
   * @param {number} [options.maxOutboundStreams=32]
   * @param {number} [options.incomingStreamTimeout=30000]
   * @param {MultihashHasherLoader} [options.hashLoader]
   */
  constructor (libp2p, blockstore, options = {}) {
    super()

    this._libp2p = libp2p
    this._log = logger(this.peerId)

    this._options = Object.assign({}, defaultOptions, options)

    // stats
    this._stats = new Stats(libp2p, statsKeys, {
      enabled: this._options.statsEnabled,
      computeThrottleTimeout: this._options.statsComputeThrottleTimeout,
      computeThrottleMaxQueueSize: this._options.statsComputeThrottleMaxQueueSize
    })

    // the network delivers messages
    this.network = new Network(libp2p, this, this._stats, {
      hashLoader: options.hashLoader,
      maxInboundStreams: options.maxInboundStreams,
      maxOutboundStreams: options.maxOutboundStreams,
      incomingStreamTimeout: options.incomingStreamTimeout
    })

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(this.peerId, blockstore, this.network, this._stats, libp2p)

    // handle message sending
    this.wm = new WantManager(this.peerId, this.network, this._stats, libp2p)

    this.notifications = new Notifications(this.peerId)

    this.started = false
  }

  isStarted () {
    return this.started
  }

  /**
   * @type {PeerId}
   */
  get peerId () {
    return this._libp2p.peerId
  }

  /**
   * handle messages received through the network
   *
   * @param {PeerId} peerId
   * @param {BitswapMessage} incoming
   */
  async _receiveMessage (peerId, incoming) {
    try {
      // Note: this allows the engine to respond to any wants in the message.
      // Processing of the blocks in the message happens below, after the
      // blocks have been added to the blockstore.
      await this.engine.messageReceived(peerId, incoming)
    } catch (err) {
      // Log instead of throwing an error so as to process as much as
      // possible of the message. Currently `messageReceived` does not
      // throw any errors, but this could change in the future.
      this._log('failed to receive message', incoming)
    }

    if (incoming.blocks.size === 0) {
      return
    }

    /** @type { { cid: CID, wasWanted: boolean, data: Uint8Array }[] } */
    const received = []

    for (const [cidStr, data] of incoming.blocks.entries()) {
      const cid = CID.parse(cidStr)

      received.push({
        wasWanted: this.wm.wantlist.contains(cid),
        cid,
        data
      })
    }

    // quickly send out cancels, reduces chances of duplicate block receives
    this.wm.cancelWants(
      received
        .filter(({ wasWanted }) => wasWanted)
        .map(({ cid }) => cid)
    )

    await Promise.all(
      received.map(
        ({ cid, wasWanted, data }) => this._handleReceivedBlock(peerId, cid, data, wasWanted)
      )
    )
  }

  /**
   * @private
   * @param {PeerId} peerId
   * @param {CID} cid
   * @param {Uint8Array} data
   * @param {boolean} wasWanted
   */
  async _handleReceivedBlock (peerId, cid, data, wasWanted) {
    this._log('received block')

    const has = await this.blockstore.has(cid)

    this._updateReceiveCounters(peerId.toString(), cid, data, has)

    if (!wasWanted) {
      return
    }

    await this.put(cid, data)
  }

  /**
   * @private
   * @param {string} peerIdStr
   * @param {CID} cid
   * @param {Uint8Array} data
   * @param {boolean} exists
   */
  _updateReceiveCounters (peerIdStr, cid, data, exists) {
    this._stats.push(peerIdStr, 'blocksReceived', 1)
    this._stats.push(peerIdStr, 'dataReceived', data.length)

    if (exists) {
      this._stats.push(peerIdStr, 'dupBlksReceived', 1)
      this._stats.push(peerIdStr, 'dupDataReceived', data.length)
    }
  }

  /**
   * handle errors on the receiving channel
   *
   * @param {Error} err
   */
  _receiveError (err) {
    this._log.error('ReceiveError: %s', err.message)
  }

  /**
   * handle new peers
   *
   * @param {PeerId} peerId
   */
  _onPeerConnected (peerId) {
    this.wm.connected(peerId)
  }

  /**
   * handle peers being disconnected
   *
   * @param {PeerId} peerId
   */
  _onPeerDisconnected (peerId) {
    this.wm.disconnected(peerId)
    this.engine.peerDisconnected(peerId)
    this._stats.disconnected(peerId)
  }

  enableStats () {
    this._stats.enable()
  }

  disableStats () {
    this._stats.disable()
  }

  /**
   * Return the current wantlist for a given `peerId`
   *
   * @param {PeerId} peerId
   * @param {any} [_options]
   */
  wantlistForPeer (peerId, _options) {
    return this.engine.wantlistForPeer(peerId)
  }

  /**
   * Return ledger information for a given `peerId`
   *
   * @param {PeerId} peerId
   */
  ledgerForPeer (peerId) {
    return this.engine.ledgerForPeer(peerId)
  }

  /**
   * Fetch a given block by cid. If the block is in the local
   * blockstore it is returned, otherwise the block is added to the wantlist and returned once another node sends it to us.
   *
   * @param {CID} cid
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async get (cid, options = {}) {
    /**
     * @param {CID} cid
     * @param {object} options
     * @param {AbortSignal} options.signal
     */
    const fetchFromNetwork = (cid, options) => {
      // add it to the want list - n.b. later we will abort the AbortSignal
      // so no need to remove the blocks from the wantlist after we have it
      this.wm.wantBlocks([cid], options)

      return this.notifications.wantBlock(cid, options)
    }

    let promptedNetwork = false

    /**
     *
     * @param {CID} cid
     * @param {object} options
     * @param {AbortSignal} options.signal
     */
    const loadOrFetchFromNetwork = async (cid, options) => {
      try {
        // have to await here as we want to handle ERR_NOT_FOUND
        const block = await this.blockstore.get(cid, options)

        return block
      } catch (/** @type {any} */ err) {
        if (err.code !== 'ERR_NOT_FOUND') {
          throw err
        }

        if (!promptedNetwork) {
          promptedNetwork = true

          this.network.findAndConnect(cid, options)
            .catch((err) => this._log.error(err))
        }

        // we don't have the block locally so fetch it from the network
        return fetchFromNetwork(cid, options)
      }
    }

    // depending on implementation it's possible for blocks to come in while
    // we do the async operations to get them from the blockstore leading to
    // a race condition, so register for incoming block notifications as well
    // as trying to get it from the datastore
    const controller = new AbortController()
    const signal = options.signal
      ? anySignal([options.signal, controller.signal])
      : controller.signal

    try {
      const block = await Promise.race([
        this.notifications.wantBlock(cid, {
          signal
        }),
        loadOrFetchFromNetwork(cid, {
          signal
        })
      ])

      return block
    } finally {
      // since we have the block we can now remove our listener
      controller.abort()
    }
  }

  /**
   * Fetch a a list of blocks by cid. If the blocks are in the local
   * blockstore they are returned, otherwise the blocks are added to the wantlist and returned once another node sends them to us.
   *
   * @param {AsyncIterable<CID>|Iterable<CID>} cids
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   */
  async * getMany (cids, options = {}) {
    for await (const cid of cids) {
      yield this.get(cid, options)
    }
  }

  /**
   * Removes the given CIDs from the wantlist independent of any ref counts.
   *
   * This will cause all outstanding promises for a given block to reject.
   *
   * If you want to cancel the want for a block without doing that, pass an
   * AbortSignal in to `.get` or `.getMany` and abort it.
   *
   * @param {CID[]|CID} cids
   */
  unwant (cids) {
    const cidsArray = Array.isArray(cids) ? cids : [cids]

    this.wm.unwantBlocks(cidsArray)
    cidsArray.forEach((cid) => this.notifications.unwantBlock(cid))
  }

  /**
   * Removes the given keys from the want list. This may cause pending promises
   * for blocks to never resolve.  If you wish these promises to abort instead
   * call `unwant(cids)` instead.
   *
   * @param {CID[]|CID} cids
   */
  cancelWants (cids) {
    this.wm.cancelWants(Array.isArray(cids) ? cids : [cids])
  }

  /**
   * Put the given block to the underlying blockstore and
   * send it to nodes that have it in their wantlist.
   *
   * @param {CID} cid
   * @param {Uint8Array} block
   * @param {any} [_options]
   */
  async put (cid, block, _options) {
    await this.blockstore.put(cid, block)
    this._sendHaveBlockNotifications(cid, block)
  }

  /**
   * Put the given blocks to the underlying blockstore and
   * send it to nodes that have it them their wantlist.
   *
   * @param {Iterable<Pair> | AsyncIterable<Pair>} source
   * @param {Options} [options]
   */
  async * putMany (source, options) {
    for await (const { key, value } of this.blockstore.putMany(source, options)) {
      this._sendHaveBlockNotifications(key, value)

      yield { key, value }
    }
  }

  /**
   * Sends notifications about the arrival of a block
   *
   * @private
   * @param {CID} cid
   * @param {Uint8Array} data
   */
  _sendHaveBlockNotifications (cid, data) {
    this.notifications.hasBlock(cid, data)
    this.engine.receivedBlocks([{ cid, data }])
    // Note: Don't wait for provide to finish before returning
    this.network.provide(cid).catch((err) => {
      this._log.error('Failed to provide: %s', err.message)
    })
  }

  /**
   * Get the current list of wants
   */
  getWantlist () {
    return this.wm.wantlist.entries()
  }

  /**
   * Get the current list of partners
   */
  peers () {
    return this.engine.peers()
  }

  /**
   * Get stats about the bitswap node
   */
  stat () {
    return this._stats
  }

  /**
   * Start the bitswap node
   */
  async start () {
    this.wm.start()
    await this.network.start()
    this.engine.start()
    this.started = true
  }

  /**
   * Stop the bitswap node
   */
  async stop () {
    this._stats.stop()
    this.wm.stop()
    await this.network.stop()
    this.engine.stop()
    this.started = false
  }

  unwrap () {
    return this.blockstore
  }

  /**
   * @param {CID} cid
   * @returns {Promise<boolean>}
   */
  has (cid) {
    return this.blockstore.has(cid)
  }
}
