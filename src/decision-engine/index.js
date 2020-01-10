'use strict'

const CID = require('cids')

const Message = require('../types/message')
const WantType = Message.WantType
const Wantlist = require('../types/wantlist')
const Ledger = require('./ledger')
const RequestQueue = require('./req-queue')
const TaskMerger = require('./task-merger')
const { logger } = require('../utils')

// The ideal size of the batched payload. We try to pop this much data off the
// request queue, but it may be a little more or less depending on what's in
// the queue.
const TARGET_MESSAGE_SIZE = 16 * 1024

// The maximum size of the block in bytes up to which we will replace a
// want-have with a want-block
const MAX_BLOCK_SIZE_REPLACE_HAS_WITH_BLOCK = 1024

class DecisionEngine {
  constructor (peerId, blockstore, network, stats, opts) {
    this._log = logger(peerId, 'engine')
    this.blockstore = blockstore
    this.network = network
    this._stats = stats
    this._opts = this._processOpts(opts)

    // A list of of ledgers by their partner id
    this.ledgerMap = new Map()
    this._running = false

    // Queue of want-have / want-block per peer
    this._requestQueue = new RequestQueue(TaskMerger)
  }

  _processOpts (opts) {
    return {
      ...{
        maxBlockSizeReplaceHasWithBlock: MAX_BLOCK_SIZE_REPLACE_HAS_WITH_BLOCK,
        targetMessageSize: TARGET_MESSAGE_SIZE
      },
      ...opts
    }
  }

  _outbox () {
    setImmediate(() => this._processTasks())
  }

  // Pull tasks off the request queue and send a message to the corresponding
  // peer
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
      const cid = new CID(task.topic)
      if (task.data.haveBlock) {
        if (task.data.isWantBlock) {
          blockCids.push(cid)
          blockTasks.set(cid, task.data)
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
    for (const [cid, task] of blockTasks) {
      const blk = blocks.get(cid.toString())
      // If the block was not found (it has been removed)
      if (blk == null) {
        // If the client requested DONT_HAVE, add DONT_HAVE to the message
        if (task.sendDontHave) {
          msg.addDontHave(cid)
        }
      } else {
        // Add the block to the message
        msg.addBlock(blk)
      }
    }

    // If there's nothing in the message, bail out
    if (msg.empty) {
      this._requestQueue.tasksDone(peerId, tasks)
      return
    }

    await this.network.sendMessage(peerId, msg)

    this._requestQueue.tasksDone(peerId, tasks)

    for (const block of blocks.values()) {
      this.messageSent(peerId, block)
    }

    this._processTasks()
  }

  wantlistForPeer (peerId) {
    const peerIdStr = peerId.toB58String()
    if (!this.ledgerMap.has(peerIdStr)) {
      return new Map()
    }

    return this.ledgerMap.get(peerIdStr).wantlist.sortedEntries()
  }

  ledgerForPeer (peerId) {
    const peerIdStr = peerId.toB58String()

    const ledger = this.ledgerMap.get(peerIdStr)
    if (!ledger) {
      return null
    }
    return {
      peer: ledger.partner.toPrint(),
      value: ledger.debtRatio(),
      sent: ledger.accounting.bytesSent,
      recv: ledger.accounting.bytesRecv,
      exchanged: ledger.exchangeCount
    }
  }

  peers () {
    return Array.from(this.ledgerMap.values()).map((l) => l.partner)
  }

  // Receive blocks either from an incoming message from the network, or from
  // blocks being added by the client on the localhost (eg IPFS add)
  receivedBlocks (blocks) {
    if (!blocks.length) {
      return
    }

    // Get the size of each wanted block
    const blockSizes = new Map(blocks.map(b => [b.cid.toString(), b.data.length]))

    // For each connected peer, check if it wants the block we received
    this.ledgerMap.forEach((ledger) => {
      blocks
        .map((block) => ledger.wantlistContains(block.cid))
        .filter(Boolean)
        .forEach((entry) => {
          const id = entry.cid.toString()
          const blockSize = blockSizes.get(id)
          const isWantBlock = this._sendAsBlock(entry.wantType, blockSize)

          let entrySize = blockSize
          if (!isWantBlock) {
            entrySize = Message.blockPresenceSize(entry.cid)
          }

          this._requestQueue.pushTasks(ledger.partner, [{
            topic: id,
            priority: entry.priority,
            size: entrySize,
            data: {
              blockSize,
              isWantBlock,
              haveBlock: true,
              sendDontHave: false
            }
          }])
        })
    })

    this._outbox()
  }

  // Handle incoming messages
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
      this._outbox()
      return
    }

    // Clear cancelled wants and add new wants to the ledger
    const cancels = []
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

    this._outbox()
  }

  _cancelWants (peerId, cids) {
    for (const c of cids) {
      this._requestQueue.remove(c.toString(), peerId)
    }
  }

  async _addWants (peerId, wants) {
    // Get the size of each wanted block
    const blockSizes = await this._getBlockSizes(wants.map(w => w.cid))

    const tasks = []
    for (const want of wants) {
      const id = want.cid.toString()
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

  _sendAsBlock (wantType, blockSize) {
    return wantType === WantType.Block ||
      blockSize <= this._opts.maxBlockSizeReplaceHasWithBlock
  }

  async _getBlockSizes (cids) {
    const blocks = await this._getBlocks(cids)
    return new Map([...blocks].map(([k, v]) => [k, v.data.length]))
  }

  async _getBlocks (cids) {
    const res = new Map()
    await Promise.all(cids.map(async (cid) => {
      try {
        const block = await this.blockstore.get(cid)
        res.set(cid.toString(), block)
      } catch (e) {
        if (e.code !== 'ERR_NOT_FOUND') {
          this._log.error('failed to query blockstore for %s: %s', cid, e)
        }
      }
    }))
    return res
  }

  _updateBlockAccounting (blocksMap, ledger) {
    blocksMap.forEach(b => {
      this._log('got block (%s bytes)', b.data.length)
      ledger.receivedBytes(b.data.length)
    })
  }

  // Clear up all accounting things after message was sent
  messageSent (peerId, block) {
    const ledger = this._findOrCreate(peerId)
    ledger.sentBytes(block ? block.data.length : 0)
    if (block && block.cid) {
      ledger.wantlist.remove(block.cid)
    }
  }

  numBytesSentTo (peerId) {
    return this._findOrCreate(peerId).accounting.bytesSent
  }

  numBytesReceivedFrom (peerId) {
    return this._findOrCreate(peerId).accounting.bytesRecv
  }

  peerDisconnected (peerId) {
    // if (this.ledgerMap.has(peerId.toB58String())) {
    //   this.ledgerMap.delete(peerId.toB58String())
    // }
    //
    // TODO: figure out how to remove all other references
    // in the peer request queue
  }

  _findOrCreate (peerId) {
    const peerIdStr = peerId.toB58String()
    if (this.ledgerMap.has(peerIdStr)) {
      return this.ledgerMap.get(peerIdStr)
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

module.exports = DecisionEngine
