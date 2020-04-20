'use strict'

const WantManager = require('./want-manager')
const Network = require('./network')
const DecisionEngine = require('./decision-engine')
const Notifications = require('./notifications')
const logger = require('./utils').logger
const Stats = require('./stats')
const AbortController = require('abort-controller')
const anySignal = require('any-signal')

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
 * @param {Libp2p} libp2p
 * @param {Blockstore} blockstore
 * @param {Object} options
 */
class Bitswap {
  constructor (libp2p, blockstore, options) {
    this._libp2p = libp2p
    this._log = logger(this.peerId)

    this._options = Object.assign({}, defaultOptions, options)

    // stats
    this._stats = new Stats(statsKeys, {
      enabled: this._options.statsEnabled,
      computeThrottleTimeout: this._options.statsComputeThrottleTimeout,
      computeThrottleMaxQueueSize: this._options.statsComputeThrottleMaxQueueSize
    })

    // the network delivers messages
    this.network = new Network(libp2p, this, {}, this._stats)

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(this.peerId, blockstore, this.network, this._stats)

    // handle message sending
    this.wm = new WantManager(this.peerId, this.network, this._stats)

    this.notifications = new Notifications(this.peerId)
  }

  get peerId () {
    return this._libp2p.peerId
  }

  // handle messages received through the network
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

    const blocks = Array.from(incoming.blocks.values())

    // quickly send out cancels, reduces chances of duplicate block receives
    const wanted = blocks
      .filter((b) => this.wm.wantlist.contains(b.cid))
      .map((b) => b.cid)

    this.wm.cancelWants(wanted)

    await Promise.all(blocks.map(async (b) => {
      const wasWanted = wanted.includes(b.cid)
      await this._handleReceivedBlock(peerId, b, wasWanted)
    }))
  }

  async _handleReceivedBlock (peerId, block, wasWanted) {
    this._log('received block')

    const has = await this.blockstore.has(block.cid)

    this._updateReceiveCounters(peerId.toB58String(), block, has)

    if (!wasWanted) {
      return
    }

    await this.put(block)
  }

  _updateReceiveCounters (peerId, block, exists) {
    this._stats.push(peerId, 'blocksReceived', 1)
    this._stats.push(peerId, 'dataReceived', block.data.length)

    if (exists) {
      this._stats.push(peerId, 'dupBlksReceived', 1)
      this._stats.push(peerId, 'dupDataReceived', block.data.length)
    }
  }

  // handle errors on the receiving channel
  _receiveError (err) {
    this._log.error('ReceiveError: %s', err.message)
  }

  // handle new peers
  _onPeerConnected (peerId) {
    this.wm.connected(peerId)
  }

  // handle peers being disconnected
  _onPeerDisconnected (peerId) {
    this.wm.disconnected(peerId)
    this.engine.peerDisconnected(peerId)
    this._stats.disconnected(peerId)
  }

  /**
   * @returns {void}
   */
  enableStats () {
    this._stats.enable()
  }

  /**
   * @returns {void}
   */
  disableStats () {
    this._stats.disable()
  }

  /**
   * Return the current wantlist for a given `peerId`
   *
   * @param {PeerId} peerId
   * @returns {Map}
   */
  wantlistForPeer (peerId) {
    return this.engine.wantlistForPeer(peerId)
  }

  /**
   * Return ledger information for a given `peerId`
   *
   * @param {PeerId} peerId
   * @returns {Object}
   */
  ledgerForPeer (peerId) {
    return this.engine.ledgerForPeer(peerId)
  }

  /**
   * Fetch a given block by cid. If the block is in the local
   * blockstore it is returned, otherwise the block is added to the wantlist and returned once another node sends it to us.
   *
   * @param {CID} cid
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {Promise<Block>}
   */
  async get (cid, options = {}) {
    const fetchFromNetwork = (cid, options) => {
      // add it to the want list - n.b. later we will abort the AbortSignal
      // so no need to remove the blocks from the wantlist after we have it
      this.wm.wantBlocks([cid], options)

      return this.notifications.wantBlock(cid, options)
    }

    let promptedNetwork = false

    const loadOrFetchFromNetwork = async (cid, options) => {
      try {
        // have to await here as we want to handle ERR_NOT_FOUND
        const block = await this.blockstore.get(cid, options)

        return block
      } catch (err) {
        if (err.code !== 'ERR_NOT_FOUND') {
          throw err
        }

        if (!promptedNetwork) {
          promptedNetwork = true

          this.network.findAndConnect(cid)
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
    const signal = anySignal([options.signal, controller.signal])

    const block = await Promise.race([
      this.notifications.wantBlock(cid, {
        signal
      }),
      loadOrFetchFromNetwork(cid, {
        signal
      })
    ])

    // since we have the block we can now remove our listener
    controller.abort()

    return block
  }

  /**
   * Fetch a a list of blocks by cid. If the blocks are in the local
   * blockstore they are returned, otherwise the blocks are added to the wantlist and returned once another node sends them to us.
   *
   * @param {AsyncIterator<CID>} cids
   * @param {Object} options
   * @param {AbortSignal} options.abortSignal
   * @returns {Promise<AsyncIterator<Block>>}
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
   * @param {Iterable<CID>} cids
   * @returns {void}
   */
  unwant (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }

    this.wm.unwantBlocks(cids)
    cids.forEach((cid) => this.notifications.unwantBlock(cid))
  }

  /**
   * Removes the given keys from the want list. This may cause pending promises
   * for blocks to never resolve.  If you wish these promises to abort instead
   * call `unwant(cids)` instead.
   *
   * @param {Iterable<CID>} cids
   * @returns {void}
   */
  cancelWants (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }
    this.wm.cancelWants(cids)
  }

  /**
   * Put the given block to the underlying blockstore and
   * send it to nodes that have it in their wantlist.
   *
   * @param {Block} block
   * @returns {Promise<void>}
   */
  async put (block) {
    await this.blockstore.put(block)
    this._sendHaveBlockNotifications(block)
  }

  /**
   * Put the given blocks to the underlying blockstore and
   * send it to nodes that have it them their wantlist.
   *
   * @param {AsyncIterable<Block>} blocks
   * @returns {AsyncIterable<Block>}
   */
  async * putMany (blocks) {
    for await (const block of this.blockstore.putMany(blocks)) {
      this._sendHaveBlockNotifications(block)

      yield block
    }
  }

  /**
   * Sends notifications about the arrival of a block
   *
   * @param {Block} block
   */
  _sendHaveBlockNotifications (block) {
    this.notifications.hasBlock(block)
    this.engine.receivedBlocks([block])
    // Note: Don't wait for provide to finish before returning
    this.network.provide(block.cid).catch((err) => {
      this._log.error('Failed to provide: %s', err.message)
    })
  }

  /**
   * Get the current list of wants.
   *
   * @returns {Iterator<WantlistEntry>}
   */
  getWantlist () {
    return this.wm.wantlist.entries()
  }

  /**
   * Get the current list of partners.
   *
   * @returns {Iterator<PeerId>}
   */
  peers () {
    return this.engine.peers()
  }

  /**
   * Get stats about the bitswap node.
   *
   * @returns {Object}
   */
  stat () {
    return this._stats
  }

  /**
   * Start the bitswap node.
   *
   * @returns {void}
   */
  start () {
    this.wm.start()
    this.network.start()
    this.engine.start()
  }

  /**
   * Stop the bitswap node.
   *
   * @returns {void}
   */
  stop () {
    this._stats.stop()
    this.wm.stop()
    this.network.stop()
    this.engine.stop()
  }
}

module.exports = Bitswap
