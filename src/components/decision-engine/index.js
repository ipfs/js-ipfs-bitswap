'use strict'

const debug = require('debug')
const each = require('async/each')
const eachSeries = require('async/eachSeries')
const waterfall = require('async/waterfall')
const map = require('async/map')
const debounce = require('lodash.debounce')
const uniqWith = require('lodash.uniqwith')
const find = require('lodash.find')
const values = require('lodash.values')
const groupBy = require('lodash.groupby')
const pullAllWith = require('lodash.pullallwith')

const log = debug('bitswap:engine')
log.error = debug('bitswap:engine:error')

const Message = require('../../types/message')
const Wantlist = require('../../types/wantlist')
const Ledger = require('./ledger')

const MAX_MESSAGE_SIZE = 512 * 1024

class DecisionEngine {
  constructor (blockstore, network) {
    this.blockstore = blockstore
    this.network = network

    // A list of of ledgers by their partner id
    this.ledgerMap = new Map()
    this._running = false

    // List of tasks to be processed
    this._tasks = []

    this._outbox = debounce(this._processTasks.bind(this), 100)
  }

  _sendBlocks (env, cb) {
    // split into messges of max 512 * 1024 bytes
    const blocks = env.blocks
    const total = blocks.reduce((acc, b) => {
      return acc + b.data.byteLength
    }, 0)

    if (total < MAX_MESSAGE_SIZE) {
      return this._sendSafeBlocks(env.peer, blocks, cb)
    }

    let size = 0
    let batch = []

    eachSeries(blocks, (b, cb) => {
      batch.push(b)
      size += b.data.byteLength

      if (size >= MAX_MESSAGE_SIZE) {
        const nextBatch = batch.slice()
        batch = []
        this._sendSafeBlocks(env.peer, nextBatch, cb)
      } else {
        cb()
      }
    }, cb)
  }

  _sendSafeBlocks (peer, blocks, cb) {
    const msg = new Message(false)

    blocks.forEach((b) => {
      msg.addBlock(b)
    })

    // console.log('sending %s blocks', msg.blocks.size)
    this.network.sendMessage(peer, msg, (err) => {
      if (err) {
        log('sendblock error: %s', err.message)
      }
      cb()
    })
  }

  _processTasks () {
    if (!this._running || !this._tasks.length) {
      return
    }

    const tasks = this._tasks
    this._tasks = []
    const entries = tasks.map((t) => t.entry)
    const cids = entries.map((e) => e.cid)
    const uniqCids = uniqWith(cids, (a, b) => a.equals(b))
    const groupedTasks = groupBy(tasks, (task) => task.target.toB58String())

    waterfall([
      (cb) => map(uniqCids, (cid, cb) => {
        this.blockstore.get(cid, cb)
      }, cb),
      (blocks, cb) => each(values(groupedTasks), (tasks, cb) => {
        // all tasks have the same target
        const peer = tasks[0].target
        const blockList = cids.map((cid) => {
          return find(blocks, (b) => b.cid.equals(cid))
        })

        this._sendBlocks({
          peer: peer,
          blocks: blockList
        }, (err) => {
          if (err) {
            log.error('failed to send', err)
          }
          blockList.forEach((block) => {
            this.messageSent(peer, block)
          })
          cb()
        })
      })
    ], (err) => {
      this._tasks = []
      if (err) {
        log.error(err)
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
      return cb()
    }

    // If the message was a full wantlist clear the current one
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    this._processBlocks(msg.blocks, ledger)

    if (msg.wantlist.size === 0) {
      return cb()
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

    pullAllWith(this._tasks, entries, (t, e) => {
      const sameTarget = t.target.toB58String() === id
      const sameCid = t.entry.cid.equals(e.cid)
      return sameTarget && sameCid
    })
  }

  _addWants (ledger, peerId, entries, cb) {
    each(entries, (entry, cb) => {
      // If we already have the block, serve it
      this.blockstore.has(entry.cid, (err, exists) => {
        if (err) {
          log.error('failed existence check')
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
      cb()
    })
  }

  _processBlocks (blocks, ledger, callback) {
    const cids = []
    blocks.forEach((b, cidStr) => {
      log('got block (%s bytes)', b.data.length)
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
