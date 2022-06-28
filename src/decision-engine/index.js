import { CID } from 'multiformats/cid'
import { base58btc } from 'multiformats/bases/base58'
import { BitswapMessage as Message } from '../message/index.js'
import { Wantlist } from '../wantlist/index.js'
import { Ledger } from './ledger.js'
import { RequestQueue } from './req-queue.js'
import { TaskMerger } from './task-merger.js'
import { logger } from '../utils/index.js'
import { trackedMap } from '@libp2p/tracked-map'

/**
 * @typedef {import('../message/entry').BitswapMessageEntry} BitswapMessageEntry
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 */

const WantType = Message.WantType

// The ideal size of the batched payload. We try to pop this much data off the
// request queue, but
// - if there isn't any more data in the queue we send whatever we have
// - if there are several small items in the queue (eg HAVE response) followed
//   by one big item (eg a block) that would exceed this target size, we
//   include the big item in the message
const TARGET_MESSAGE_SIZE = 16 * 1024

// If the client sends a want-have, and the engine has the corresponding block,
// we check the size of the block and if it's small enough we send the block
// itself, rather than sending a HAVE.
// This constant defines the maximum size up to which we replace a HAVE with
// a block.
const MAX_SIZE_REPLACE_HAS_WITH_BLOCK = 1024

export class DecisionEngine {
  /**
   * @param {PeerId} peerId
   * @param {import('interface-blockstore').Blockstore} blockstore
   * @param {import('../network').Network} network
   * @param {import('../stats').Stats} stats
   * @param {import('libp2p').Libp2p} libp2p
   * @param {object} [opts]
   * @param {number} [opts.targetMessageSize]
   * @param {number} [opts.maxSizeReplaceHasWithBlock]
   */
  constructor (peerId, blockstore, network, stats, libp2p, opts = {}) {
    this._log = logger(peerId, 'engine')
    this.blockstore = blockstore
    this.network = network
    this._stats = stats
    this._opts = this._processOpts(opts)

    // A list of of ledgers by their partner id
    /** @type {Map<string, Ledger>} */
    this.ledgerMap = trackedMap({
      system: 'ipfs',
      component: 'bitswap',
      metric: 'ledger-map',
      metrics: libp2p.metrics
    })
    this._running = false

    // Queue of want-have / want-block per peer
    this._requestQueue = new RequestQueue(TaskMerger)
  }

  /**
   * @template {object} Opts
   * @param {Opts} opts
   * @returns {Opts & {maxSizeReplaceHasWithBlock:number, targetMessageSize:number}}
   * @private
   */
  _processOpts (opts) {
    return {
      maxSizeReplaceHasWithBlock: MAX_SIZE_REPLACE_HAS_WITH_BLOCK,
      targetMessageSize: TARGET_MESSAGE_SIZE,
      ...opts
    }
  }

  _scheduleProcessTasks () {
    setTimeout(() => {
      this._processTasks()
    })
  }

  /**
   * Pull tasks off the request queue and send a message to the corresponding
   * peer
   */
  async _processTasks () {
    if (!this._running) {
      return
    }

    const { peerId, tasks, pendingSize } = this._requestQueue.popTasks(this._opts.targetMessageSize)

    if (tasks.length === 0) {
      return
    }

    // Create a new message
    const msg = new Message(false)

    // Amount of data in the request queue still waiting to be popped
    msg.setPendingBytes(pendingSize)

    // Split out want-blocks, want-haves and DONT_HAVEs
    const blockCids = []
    const blockTasks = new Map()
    for (const task of tasks) {
      const cid = CID.parse(task.topic)
      if (task.data.haveBlock) {
        if (task.data.isWantBlock) {
          blockCids.push(cid)
          blockTasks.set(task.topic, task.data)
        } else {
          // Add HAVES to the message
          msg.addHave(cid)
        }
      } else {
        // Add DONT_HAVEs to the message
        msg.addDontHave(cid)
      }
    }

    const blocks = await this._getBlocks(blockCids)
    for (const [topic, taskData] of blockTasks) {
      const cid = CID.parse(topic)
      const blk = blocks.get(topic)
      // If the block was found (it has not been removed)
      if (blk) {
        // Add the block to the message
        msg.addBlock(cid, blk)
      } else {
        // The block was not found. If the client requested DONT_HAVE,
        // add DONT_HAVE to the message.
        if (taskData.sendDontHave) {
          msg.addDontHave(cid)
        }
      }
    }

    // If there's nothing in the message, bail out
    if (msg.empty) {
      peerId && this._requestQueue.tasksDone(peerId, tasks)

      // Trigger the next round of task processing
      this._scheduleProcessTasks()

      return
    }

    try {
      // Send the message
      peerId && await this.network.sendMessage(peerId, msg)

      // Peform sent message accounting
      for (const [cidStr, block] of blocks.entries()) {
        peerId && this.messageSent(peerId, CID.parse(cidStr), block)
      }
    } catch (err) {
      this._log.error(err)
    }

    // Free the tasks up from the request queue
    peerId && this._requestQueue.tasksDone(peerId, tasks)

    // Trigger the next round of task processing
    this._scheduleProcessTasks()
  }

  /**
   * @param {PeerId} peerId
   * @returns {Map<string, import('../wantlist/entry').WantListEntry>}
   */
  wantlistForPeer (peerId) {
    const peerIdStr = peerId.toString()
    const ledger = this.ledgerMap.get(peerIdStr)
    return ledger ? ledger.wantlist.sortedEntries() : new Map()
  }

  /**
   * @param {PeerId} peerId
   */
  ledgerForPeer (peerId) {
    const peerIdStr = peerId.toString()

    const ledger = this.ledgerMap.get(peerIdStr)

    if (!ledger) {
      return null
    }

    return {
      peer: ledger.partner,
      value: ledger.debtRatio(),
      sent: ledger.accounting.bytesSent,
      recv: ledger.accounting.bytesRecv,
      exchanged: ledger.exchangeCount
    }
  }

  /**
   * @returns {PeerId[]}
   */
  peers () {
    return Array.from(this.ledgerMap.values()).map((l) => l.partner)
  }

  /**
   * Receive blocks either from an incoming message from the network, or from
   * blocks being added by the client on the localhost (eg IPFS add)
   *
   * @param {{ cid: CID, data: Uint8Array }[]} blocks
   */
  receivedBlocks (blocks) {
    if (!blocks.length) {
      return
    }

    // For each connected peer, check if it wants the block we received
    for (const ledger of this.ledgerMap.values()) {
      for (const block of blocks) {
        // Filter out blocks that we don't want
        const want = ledger.wantlistContains(block.cid)

        if (!want) {
          continue
        }

        // If the block is small enough, just send the block, even if the
        // client asked for a HAVE
        const blockSize = block.data.length
        const isWantBlock = this._sendAsBlock(want.wantType, blockSize)

        let entrySize = blockSize
        if (!isWantBlock) {
          entrySize = Message.blockPresenceSize(want.cid)
        }

        this._requestQueue.pushTasks(ledger.partner, [{
          topic: want.cid.toString(base58btc),
          priority: want.priority,
          size: entrySize,
          data: {
            blockSize,
            isWantBlock,
            haveBlock: true,
            sendDontHave: false
          }
        }])
      }
    }

    this._scheduleProcessTasks()
  }

  /**
   * Handle incoming messages
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   * @returns {Promise<void>}
   */
  async messageReceived (peerId, msg) {
    const ledger = this._findOrCreate(peerId)

    if (msg.empty) {
      return
    }

    // If the message has a full wantlist, clear the current wantlist
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    // Record the amount of block data received
    this._updateBlockAccounting(msg.blocks, ledger)

    if (msg.wantlist.size === 0) {
      this._scheduleProcessTasks()
      return
    }

    // Clear cancelled wants and add new wants to the ledger
    /** @type {CID[]} */
    const cancels = []
    /** @type {BitswapMessageEntry[]} */
    const wants = []
    msg.wantlist.forEach((entry) => {
      if (entry.cancel) {
        ledger.cancelWant(entry.cid)
        cancels.push(entry.cid)
      } else {
        ledger.wants(entry.cid, entry.priority, entry.wantType)
        wants.push(entry)
      }
    })

    this._cancelWants(peerId, cancels)
    await this._addWants(peerId, wants)

    this._scheduleProcessTasks()
  }

  /**
   * @private
   * @param {PeerId} peerId
   * @param {CID[]} cids
   * @returns {void}
   */
  _cancelWants (peerId, cids) {
    for (const c of cids) {
      this._requestQueue.remove(c.toString(base58btc), peerId)
    }
  }

  /**
   * @private
   * @param {PeerId} peerId
   * @param {BitswapMessageEntry[]} wants
   * @returns {Promise<void>}
   */
  async _addWants (peerId, wants) {
    // Get the size of each wanted block
    const blockSizes = await this._getBlockSizes(wants.map(w => w.cid))

    const tasks = []
    for (const want of wants) {
      const id = want.cid.toString(base58btc)
      const blockSize = blockSizes.get(id)

      // If the block was not found
      if (blockSize == null) {
        // Only add the task to the queue if the requester wants a DONT_HAVE
        if (want.sendDontHave) {
          tasks.push({
            topic: id,
            priority: want.priority,
            size: Message.blockPresenceSize(want.cid),
            data: {
              isWantBlock: want.wantType === WantType.Block,
              blockSize: 0,
              haveBlock: false,
              sendDontHave: want.sendDontHave
            }
          })
        }
      } else {
        // The block was found, add it to the queue

        // If the block is small enough, just send the block, even if the
        // client asked for a HAVE
        const isWantBlock = this._sendAsBlock(want.wantType, blockSize)

        // entrySize is the amount of space the entry takes up in the
        // message we send to the recipient. If we're sending a block, the
        // entrySize is the size of the block. Otherwise it's the size of
        // a block presence entry.
        let entrySize = blockSize
        if (!isWantBlock) {
          entrySize = Message.blockPresenceSize(want.cid)
        }

        tasks.push({
          topic: id,
          priority: want.priority,
          size: entrySize,
          data: {
            isWantBlock,
            blockSize,
            haveBlock: true,
            sendDontHave: want.sendDontHave
          }
        })
      }

      this._requestQueue.pushTasks(peerId, tasks)
    }
  }

  /**
   * @private
   * @param {import('../message/message').Message.Wantlist.WantType} wantType
   * @param {number} blockSize
   */
  _sendAsBlock (wantType, blockSize) {
    return wantType === WantType.Block ||
      blockSize <= this._opts.maxSizeReplaceHasWithBlock
  }

  /**
   * @private
   * @param {CID[]} cids
   * @returns {Promise<Map<string, number>>}
   */
  async _getBlockSizes (cids) {
    const blocks = await this._getBlocks(cids)
    return new Map([...blocks].map(([k, v]) => [k, v.length]))
  }

  /**
   * @private
   * @param {CID[]} cids
   * @returns {Promise<Map<string, Uint8Array>>}
   */
  async _getBlocks (cids) {
    const res = new Map()
    await Promise.all(cids.map(async (cid) => {
      try {
        const block = await this.blockstore.get(cid)
        res.set(cid.toString(base58btc), block)
      } catch (/** @type {any} */ e) {
        if (e.code !== 'ERR_NOT_FOUND') {
          this._log.error('failed to query blockstore for %s: %s', cid, e)
        }
      }
    }))
    return res
  }

  /**
   * @private
   * @param {Map<string, Uint8Array>} blocksMap
   * @param {Ledger} ledger
   */
  _updateBlockAccounting (blocksMap, ledger) {
    for (const block of blocksMap.values()) {
      this._log('got block (%s bytes)', block.length)
      ledger.receivedBytes(block.length)
    }
  }

  /**
   * Clear up all accounting things after message was sent
   *
   * @param {PeerId} peerId
   * @param {CID} cid
   * @param {Uint8Array} block
   */
  messageSent (peerId, cid, block) {
    const ledger = this._findOrCreate(peerId)
    ledger.sentBytes(block.length)
    ledger.wantlist.remove(cid)
  }

  /**
   * @param {PeerId} peerId
   * @returns {number}
   */
  numBytesSentTo (peerId) {
    return this._findOrCreate(peerId).accounting.bytesSent
  }

  /**
   * @param {PeerId} peerId
   * @returns {number}
   */

  numBytesReceivedFrom (peerId) {
    return this._findOrCreate(peerId).accounting.bytesRecv
  }

  /**
   *
   * @param {PeerId} peerId
   */
  peerDisconnected (peerId) {
    this.ledgerMap.delete(peerId.toString())
  }

  /**
   * @private
   * @param {PeerId} peerId
   * @returns {Ledger}
   */
  _findOrCreate (peerId) {
    const peerIdStr = peerId.toString()
    const ledger = this.ledgerMap.get(peerIdStr)
    if (ledger) {
      return ledger
    }

    const l = new Ledger(peerId)

    this.ledgerMap.set(peerIdStr, l)
    if (this._stats) {
      this._stats.push(peerIdStr, 'peerCount', 1)
    }

    return l
  }

  start () {
    this._running = true
  }

  stop () {
    this._running = false
  }
}
