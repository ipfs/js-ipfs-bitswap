'use strict'

const waterfall = require('async/waterfall')
const reject = require('async/reject')
const each = require('async/each')
const series = require('async/series')
const map = require('async/map')
const once = require('once')

const WantManager = require('./want-manager')
const Network = require('./network')
const DecisionEngine = require('./decision-engine')
const Notifications = require('./notifications')
const logger = require('./utils').logger

/**
 * JavaScript implementation of the Bitswap 'data exchange' protocol
 * used by IPFS.
 *
 * @param {Libp2p} libp2p
 * @param {Blockstore} blockstore
 */
class Bitswap {
  constructor (libp2p, blockstore) {
    this._libp2p = libp2p
    this._log = logger(this.peerInfo.id)

    // the network delivers messages
    this.network = new Network(libp2p, this)

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(this.peerInfo.id, blockstore, this.network)

    // handle message sending
    this.wm = new WantManager(this.peerInfo.id, this.network)

    this.blocksRecvd = 0
    this.dupBlocksRecvd = 0
    this.dupDataRecvd = 0

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
    this._log('received block')

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
      this.dupBlocksRecvd++
      this.dupDataRecvd += block.data.length
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
  }

  _putBlock (block, callback) {
    this.blockstore.put(block, (err) => {
      if (err) {
        return callback(err)
      }

      this.notifications.hasBlock(block)
      this.network.provide(block.cid, (err) => {
        if (err) {
          this._log.error('Failed to provide: %s', err.message)
        }
      })

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
    this.getMany([cid], (err, blocks) => {
      if (err) {
        return callback(err)
      }

      if (blocks && blocks.length > 0) {
        callback(null, blocks[0])
      } else {
        // when a unwant happens
        callback()
      }
    })
  }

  /**
   * Fetch a a list of blocks by cid. If the blocks are in the local
   * blockstore they are returned, otherwise the blocks are added to the wantlist and returned once another node sends them to us.
   *
   * @param {Array<CID>} cids
   * @param {function(Error, Blocks)} callback
   * @returns {void}
   */
  getMany (cids, callback) {
    const retrieved = []
    const locals = []
    const missing = []
    const canceled = []

    const finish = once(() => {
      map(locals, (cid, cb) => {
        this.blockstore.get(cid, cb)
      }, (err, localBlocks) => {
        if (err) {
          return callback(err)
        }

        callback(null, localBlocks.concat(retrieved))
      })
    })

    this._log('getMany', cids.length)

    const addListeners = (cids) => {
      cids.forEach((cid) => {
        this.notifications.wantBlock(
          cid,
          // called on block receive
          (block) => {
            this.wm.cancelWants([cid])
            retrieved.push(block)

            if (retrieved.length === missing.length) {
              finish()
            }
          },
          // called on unwant
          () => {
            this.wm.cancelWants([cid])
            canceled.push(cid)
            if (canceled.length + retrieved.length === missing.length) {
              finish()
            }
          }
        )
      })
    }

    each(cids, (cid, cb) => {
      this.blockstore.has(cid, (err, has) => {
        if (err) {
          return cb(err)
        }

        if (has) {
          locals.push(cid)
        } else {
          missing.push(cid)
        }
        cb()
      })
    }, () => {
      if (missing.length === 0) {
        // already finished
        finish()
      }

      addListeners(missing)
      this.wm.wantBlocks(missing)

      this.network.findAndConnect(cids[0], (err) => {
        if (err) {
          this._log.error(err)
        }
      })
    })
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
   * @param {Block} block
   * @param {function(Error)} callback
   * @returns {void}
   */
  put (block, callback) {
    this._log('putting block')

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
          this.notifications.hasBlock(block)
          this.engine.receivedBlocks([block.cid])
          this.network.provide(block.cid, (err) => {
            if (err) {
              this._log.error('Failed to provide: %s', err.message)
            }
          })
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
   * @param {function(Error)} callback
   *
   * @returns {void}
   */
  start (callback) {
    series([
      (cb) => this.wm.start(cb),
      (cb) => this.network.start(cb),
      (cb) => this.engine.start(cb)
    ], callback)
  }

  /**
   * Stop the bitswap node.
   *
   * @param {function(Error)} callback
   *
   * @returns {void}
   */
  stop (callback) {
    series([
      (cb) => this.wm.stop(cb),
      (cb) => this.network.stop(cb),
      (cb) => this.engine.stop(cb)
    ], callback)
  }
}

module.exports = Bitswap
