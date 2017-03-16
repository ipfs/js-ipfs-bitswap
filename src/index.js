'use strict'

const waterfall = require('async/waterfall')
const reject = require('async/reject')
const each = require('async/each')
const EventEmitter = require('events').EventEmitter
const debug = require('debug')

const CONSTANTS = require('./constants')
const WantManager = require('./components/want-manager')
const Network = require('./components/network')
const DecisionEngine = require('./components/decision-engine')

const log = debug('bitswap')
log.error = debug('bitswap:error')

/**
 *
 */
class Bitswap {
  /**
   * Create a new bitswap instance.
   *
   * @param {Libp2p} libp2p
   * @param {Blockstore} blockstore
   * @param {PeerBook} peerBook
   * @returns {Bitswap}
   */
  constructor (libp2p, blockstore, peerBook) {
    this.libp2p = libp2p
    // the network delivers messages
    this.network = new Network(libp2p, peerBook, this)

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(blockstore, this.network)

    // handle message sending
    this.wm = new WantManager(this.network)

    this.blocksRecvd = 0
    this.dupBlocksRecvd = 0
    this.dupDataRecvd = 0

    this.notifications = new EventEmitter()
    this.notifications.setMaxListeners(CONSTANTS.maxListeners)
  }

  // handle messages received through the network
  _receiveMessage (peerId, incoming, callback) {
    this.engine.messageReceived(peerId, incoming, (err) => {
      if (err) {
        log('failed to receive message', incoming)
      }

      if (incoming.blocks.size === 0) {
        return callback()
      }

      const blocks = Array.from(incoming.blocks.values())

      // quickly send out cancels, reduces chances of duplicate block receives
      const toCancel = blocks
        .filter((b) => this.wm.wantlist.contains(b.cid))
        .map((b) => b.cid)

      this.wm.cancelWants(toCancel)

      each(
        blocks,
        (b, cb) => this._handleReceivedBlock(peerId, b, cb),
        callback
      )
    })
  }

  _handleReceivedBlock (peerId, block, callback) {
    log('received block')

    waterfall([
      (cb) => this.blockstore.has(block.cid, cb),
      (has, cb) => {
        this._updateReceiveCounters(block, has)
        if (has) {
          return cb()
        }

        this._putBlock(block, cb)
      }
    ], callback)
  }

  _updateReceiveCounters (block, exists) {
    this.blocksRecvd++

    if (exists) {
      this.dupBlocksRecvd ++
      this.dupDataRecvd += block.data.length
    }
  }

  // handle errors on the receiving channel
  _receiveError (err) {
    log.error('ReceiveError: %s', err.message)
  }

  // handle new peers
  _onPeerConnected (peerId) {
    this.wm.connected(peerId)
  }

  // handle peers being disconnected
  _onPeerDisconnected (peerId) {
    this.wm.disconnected(peerId)
    this.engine.peerDisconnected(peerId)
  }

  _putBlock (block, callback) {
    this.blockstore.put(block, (err) => {
      if (err) {
        return callback(err)
      }

      this.notifications.emit(
        `block:${block.cid.buffer.toString()}`,
        block
      )
      this.engine.receivedBlocks([block.cid])
      callback()
    })
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
   * Fetch a given block by cid. If the block is in the local
   * blockstore it is returned, otherwise the block is added to the wantlist and returned once another node sends it to us.
   *
   * @param {CID} cid
   * @param {function(Error, Block)} callback
   * @returns {void}
   */
  get (cid, callback) {
    const unwantListeners = {}
    const blockListeners = {}
    const cidStr = cid.buffer.toString()
    const unwantEvent = `unwant:${cidStr}`
    const blockEvent = `block:${cidStr}`

    log('get: %s', cidStr)
    const cleanupListener = () => {
      if (unwantListeners[cidStr]) {
        this.notifications.removeListener(unwantEvent, unwantListeners[cidStr])
        delete unwantListeners[cidStr]
      }

      if (blockListeners[cidStr]) {
        this.notifications.removeListener(blockEvent, blockListeners[cidStr])
        delete blockListeners[cidStr]
      }
    }

    const addListener = () => {
      unwantListeners[cidStr] = () => {
        log(`manual unwant: ${cidStr}`)
        cleanupListener()
        this.wm.cancelWants([cid])
        callback()
      }

      blockListeners[cidStr] = (block) => {
        this.wm.cancelWants([cid])
        cleanupListener(cid)
        callback(null, block)
      }

      this.notifications.once(unwantEvent, unwantListeners[cidStr])
      this.notifications.once(blockEvent, blockListeners[cidStr])
    }

    this.blockstore.has(cid, (err, has) => {
      if (err) {
        return callback(err)
      }

      if (has) {
        log('already have block: %s', cidStr)
        return this.blockstore.get(cid, callback)
      }

      addListener()
      this.wm.wantBlocks([cid])
    })
  }

  // removes the given cids from the wantlist independent of any ref counts
  unwant (cids) {
    if (!Array.isArray(cids)) {
      cids = [cids]
    }

    this.wm.unwantBlocks(cids)
    cids.forEach((cid) => {
      this.notifications.emit(`unwant:${cid.buffer.toString()}`)
    })
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
   * @param {Block} block
   * @param {function(Error)} callback
   * @returns {void}
   */
  put (block, callback) {
    log('putting block')

    waterfall([
      (cb) => this.blockstore.has(block.cid, cb),
      (has, cb) => {
        if (has) {
          return cb()
        }

        this._putBlock(block, cb)
      }
    ], callback)
  }

  /**
   * Put the given blocks to the underlying blockstore and
   * send it to nodes that have it them their wantlist.
   *
   * @param {Array<Block>} blocks
   * @param {function(Error)} callback
   * @returns {void}
   */
  putMany (blocks, callback) {
    waterfall([
      (cb) => reject(blocks, (b, cb) => {
        this.blockstore.has(b.cid, cb)
      }, cb),
      (newBlocks, cb) => this.blockstore.putMany(newBlocks, (err) => {
        if (err) {
          return cb(err)
        }

        newBlocks.forEach((block) => {
          this.notifications.emit(
            `block:${block.cid.buffer.toString()}`,
            block
          )
          this.engine.receivedBlocks([block.cid])
        })
        cb()
      })
    ], callback)
  }

  /**
   * Get the current list of wants.
   *
   * @returns {Array<WantlistEntry>}
   */
  getWantlist () {
    return this.wm.wantlist.entries()
  }

  /**
   * Get stats about the bitswap node.
   *
   * @returns {Object}
   */
  stat () {
    return {
      wantlist: this.getWantlist(),
      blocksReceived: this.blocksRecvd,
      dupBlksReceived: this.dupBlocksRecvd,
      dupDataReceived: this.dupDataRecvd,
      peers: this.engine.peers()
    }
  }

  /**
   * Start the bitswap node.
   *
   * @returns {void}
   */
  start () {
    this.wm.run()
    this.network.start()
    this.engine.start()
  }

  /**
   * Stooop the bitswap node.
   *
   * @returns {void}
   */
  stop () {
    this.wm.stop(this.libp2p.peerInfo.id)
    this.network.stop()
    this.engine.stop()
  }
}

module.exports = Bitswap
