'use strict'

const waterfall = require('async/waterfall')
const each = require('async/each')
const nextTick = require('async/nextTick')
const promisify = require('promisify-es6')
const typical = require('typical')

const WantManager = require('./want-manager')
const Network = require('./network')
const DecisionEngine = require('./decision-engine')
const Notifications = require('./notifications')
const { logger, extendIterator } = require('./utils')
const Stats = require('./stats')

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
 */
class Bitswap {
  constructor (libp2p, blockstore, options) {
    this._libp2p = libp2p
    this._log = logger(this.peerInfo.id)

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

    this.engine = new DecisionEngine(this.peerInfo.id, blockstore, this.network, this._stats)

    // handle message sending
    this.wm = new WantManager(this.peerInfo.id, this.network, this._stats)

    this.notifications = new Notifications(this.peerInfo.id)
  }

  get peerInfo () {
    return this._libp2p.peerInfo
  }

  // handle messages received through the network
  _receiveMessage (peerId, incoming, callback) {
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        // Only logging the issue to process as much as possible
        // of the message. Currently `messageReceived` does not
        // return any errors, but this could change in the future.
        this._log('failed to receive message', incoming)
      }

      if (incoming.blocks.size === 0) {
        return callback()
      }

      const blocks = Array.from(incoming.blocks.values())

      // quickly send out cancels, reduces chances of duplicate block receives
      const wanted = blocks
        .filter((b) => this.wm.wantlist.contains(b.cid))
        .map((b) => b.cid)

      this.wm.cancelWants(wanted)

      each(
        blocks,
        (b, cb) => {
          const wasWanted = wanted.includes(b.cid)
          this._handleReceivedBlock(peerId, b, wasWanted, cb)
        },
        callback
      )
    })
  }

  _handleReceivedBlock (peerId, block, wasWanted, callback) {
    this._log('received block')

    waterfall([
      (cb) => this.blockstore.has(block.cid, cb),
      (has, cb) => {
        this._updateReceiveCounters(peerId.toB58String(), block, has)
        if (has || !wasWanted) {
          return nextTick(cb)
        }

        this.put(block).then(() => cb())
      }
    ], callback)
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

  _findAndConnect (cid) {
    this.network.findAndConnect(cid, (err) => {
      if (err) this._log.error(err)
    })
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
   * @returns {Wantlist}
   */
  wantlistForPeer (peerId) {
    return this.engine.wantlistForPeer(peerId)
  }

  /**
   * Return ledger information for a given `peerId`
   *
   * @param {PeerId} peerId
   * @returns {?Object}
   */
  ledgerForPeer (peerId) {
    return this.engine.ledgerForPeer(peerId)
  }

  /**
   * Fetch a given block by cid. If the block is in the local
   * blockstore it is returned, otherwise the block is added to the wantlist and returned once another node sends it to us.
   *
   * @param {CID} cid - The CID of the block that should be retrieved.
   * @param {Object} options
   * @param {boolean} options.promptNetwork - Option whether to promptNetwork or not
   * @returns {Promise.<Object>} - Returns a promise with a block corresponding with the given `cid`.
   */
  async get (cid, options) {
    const optionsCopy = Object.assign({}, options)

    optionsCopy.promptNetwork = optionsCopy.promptNetwork || true

    const getFromOutside = (cid) => {
      return new Promise((resolve) => {
        this.wm.wantBlocks([cid])

        this.notifications.wantBlock(
          cid,
          // called on block receive
          (block) => {
            this.wm.cancelWants([cid])
            resolve(block)
          },
          // called on unwant
          () => {
            this.wm.cancelWants([cid])
            resolve(undefined)
          }
        )
      })
    }

    if (await promisify(this.blockstore.has)(cid)) {
      return promisify(this.blockstore.get)(cid)
    } else {
      if (optionsCopy.promptNetwork) {
        this._findAndConnect(cid)
      }
      return getFromOutside(cid)
    }
  }

  /**
   * Fetch a a list of blocks by cid. If the blocks are in the local
   * blockstore they are returned, otherwise the blocks are added to the wantlist and returned once another node sends them to us.
   *
   * @param {Iterable.<CID>} cids
   * @returns {Iterable.<Promise.<Object>>}
   */
  getMany (cids) {
    if (!typical.isIterable(cids) || typical.isString(cids) ||
        Buffer.isBuffer(cids)) {
      throw new Error('`cids` must be an iterable of CIDs')
    }

    const generator = async function * () {
      let promptNetwork = true
      for await (const cid of cids) {
        if (promptNetwork) {
          yield this.get(cid, { promptNetwork: true })
          promptNetwork = false
        } else {
          yield this.get(cid, { promptNetwork: false })
        }
      }
    }.bind(this)

    return extendIterator(generator())
  }

  // removes the given cids from the wantlist independent of any ref counts
  unwant (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }

    this.wm.unwantBlocks(cids)
    cids.forEach((cid) => this.notifications.unwantBlock(cid))
  }

  // removes the given keys from the want list
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
   * @param {Block} block - Block that should be inserted.
   * @returns {Promise.<CID>} - Returns the CID of the serialized IPLD Nodes.
   */
  async put (block) {
    this._log('putting block')

    const has = await promisify(this.blockstore.has)(block.cid)
    if (!has) {
      await promisify(this.blockstore.put)(block)
      this.notifications.hasBlock(block)
      this.network.provide(block.cid, (err) => {
        if (err) this._log.error('Failed to provide: %s', err.message)
      })
      this.engine.receivedBlocks([block.cid])
    }

    return block.cid
  }

  /**
   * Put the given blocks to the underlying blockstore and
   * send it to nodes that have it them their wantlist.
   *
   * @param {Iterable.<Block>} blocks
   * @returns {Iterable.<Promise.<CID>>} - Returns an async iterator with the CIDs of the blocks inserted
   */
  putMany (blocks) {
    if (!typical.isIterable(blocks)) {
      throw new Error('`blocks` must be an iterable')
    }

    const generator = async function * () {
      for await (const block of blocks) {
        const has = await promisify(this.blockstore.has)(block.cid)
        if (!has) {
          yield this.put(block)
        }
      }
    }.bind(this)

    return extendIterator(generator())
  }

  /**
   * Get the current list of wants.
   *
   * @returns {Iterator.<WantlistEntry>}
   */
  getWantlist () {
    return this.wm.wantlist.entries()
  }

  /**
   * Get the current list of partners.
   *
   * @returns {Array.<PeerId>}
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
   * @returns {Promise}
   */
  async start () {
    await promisify(this.wm.start.bind(this.wm))()
    await promisify(this.network.start.bind(this.network))()
    await promisify(this.engine.start.bind(this.engine))()
  }

  /**
   * Stop the bitswap node.
   *
   * @returns {Promise}
   */
  async stop () {
    this._stats.stop()

    await promisify(this.wm.stop.bind(this.wm))()
    await promisify(this.network.stop.bind(this.network))()
    await promisify(this.engine.stop.bind(this.engine))()
  }
}

module.exports = Bitswap
