'use strict'

const each = require('async/each')
const eachSeries = require('async/eachSeries')
const waterfall = require('async/waterfall')
const nextTick = require('async/nextTick')

const map = require('async/map')
const debounce = require('just-debounce-it')

const Message = require('../types/message')
const Wantlist = require('../types/wantlist')
const Ledger = require('./ledger')
const { logger, groupBy, pullAllWith, uniqWith } = require('../utils')

const MAX_MESSAGE_SIZE = 512 * 1024

class DecisionEngine {
  constructor (peerId, blockstore, network, stats) {
    this._log = logger(peerId, 'engine')
    this.blockstore = blockstore
    this.network = network
    this._stats = stats

    // A list of of ledgers by their partner id
    this.ledgerMap = new Map()
    this._running = false

    // List of tasks to be processed
    this._tasks = []

    this._outbox = debounce(this._processTasks.bind(this), 100)
  }

  _sendBlocks (peer, blocks, cb) {
    // split into messges of max 512 * 1024 bytes
    const total = blocks.reduce((acc, b) => {
      return acc + b.data.byteLength
    }, 0)

    if (total < MAX_MESSAGE_SIZE) {
      return this._sendSafeBlocks(peer, blocks, cb)
    }

    let size = 0
    let batch = []
    let outstanding = blocks.length

    eachSeries(blocks, (b, cb) => {
      outstanding--
      batch.push(b)
      size += b.data.byteLength

      if (size >= MAX_MESSAGE_SIZE ||
          // need to ensure the last remaining items get sent
          outstanding === 0) {
        size = 0
        const nextBatch = batch.slice()
        batch = []
        this._sendSafeBlocks(peer, nextBatch, (err) => {
          if (err) {
            this._log('sendblock error: %s', err.message)
          }
          // not returning the error, so we send as much as we can
          // as otherwise `eachSeries` would cancel
          cb()
        })
      } else {
        nextTick(cb)
      }
    }, cb)
  }

  _sendSafeBlocks (peer, blocks, cb) {
    const msg = new Message(false)
    blocks.forEach((b) => msg.addBlock(b))

    this.network.sendMessage(peer, msg, cb)
  }

  _processTasks () {
    if (!this._running || !this._tasks.length) {
      return
    }

    const tasks = this._tasks
    this._tasks = []
    const entries = tasks.map((t) => t.entry)
    const cids = entries.map((e) => e.cid)
    const uniqCids = uniqWith((a, b) => a.equals(b), cids)
    const groupedTasks = groupBy(task => task.target.toB58String(), tasks)

    waterfall([
      (callback) => map(uniqCids, (cid, cb) => {
        this.blockstore.get(cid, cb)
      }, callback),
      (blocks, callback) => each(Object.values(groupedTasks), (tasks, cb) => {
        // all tasks have the same target
        const peer = tasks[0].target
        const blockList = cids.map((cid) => {
          return blocks.find(b => b.cid.equals(cid))
        })

        this._sendBlocks(peer, blockList, (err) => {
          if (err) {
            // `_sendBlocks` actually doesn't return any errors
            this._log.error('should never happen: ', err)
          } else {
            blockList.forEach((block) => this.messageSent(peer, block))
          }

          cb()
        })
      }, callback)
    ], (err) => {
      this._tasks = []

      if (err) {
        this._log.error(err)
      }
    })
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

  receivedBlocks (cids) {
    if (!cids.length) {
      return
    }
    // Check all connected peers if they want the block we received
    this.ledgerMap.forEach((ledger) => {
      cids
        .map((cid) => ledger.wantlistContains(cid))
        .filter(Boolean)
        .forEach((entry) => {
          this._tasks.push({
            entry: entry,
            target: ledger.partner
          })
        })
    })
    this._outbox()
  }

  // Handle incoming messages
  messageReceived (peerId, msg, cb) {
    const ledger = this._findOrCreate(peerId)

    if (msg.empty) {
      return nextTick(cb)
    }

    // If the message was a full wantlist clear the current one
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    this._processBlocks(msg.blocks, ledger)

    if (msg.wantlist.size === 0) {
      return nextTick(cb)
    }

    let cancels = []
    let wants = []
    msg.wantlist.forEach((entry) => {
      if (entry.cancel) {
        ledger.cancelWant(entry.cid)
        cancels.push(entry)
      } else {
        ledger.wants(entry.cid, entry.priority)
        wants.push(entry)
      }
    })

    this._cancelWants(ledger, peerId, cancels)
    this._addWants(ledger, peerId, wants, cb)
  }

  _cancelWants (ledger, peerId, entries) {
    const id = peerId.toB58String()

    this._tasks = pullAllWith((t, e) => {
      const sameTarget = t.target.toB58String() === id
      const sameCid = t.entry.cid.equals(e.cid)
      return sameTarget && sameCid
    }, this._tasks, entries)
  }

  _addWants (ledger, peerId, entries, callback) {
    each(entries, (entry, cb) => {
      // If we already have the block, serve it
      this.blockstore.has(entry.cid, (err, exists) => {
        if (err) {
          this._log.error('failed existence check')
        } else if (exists) {
          this._tasks.push({
            entry: entry.entry,
            target: peerId
          })
        }
        cb()
      })
    }, () => {
      this._outbox()
      callback()
    })
  }

  _processBlocks (blocks, ledger, callback) {
    const cids = []
    blocks.forEach((b, cidStr) => {
      this._log('got block (%s bytes)', b.data.length)
      ledger.receivedBytes(b.data.length)
      cids.push(b.cid)
    })

    this.receivedBlocks(cids)
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

  start (callback) {
    this._running = true
    nextTick(() => callback())
  }

  stop (callback) {
    this._running = false
    nextTick(() => callback())
  }
}

module.exports = DecisionEngine
