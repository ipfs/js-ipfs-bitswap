'use strict'

const debug = require('debug')
const pull = require('pull-stream')
const each = require('async/each')
const map = require('async/map')
const waterfall = require('async/waterfall')
const debounce = require('lodash.debounce')
const uniqWith = require('lodash.uniqwith')
const find = require('lodash.find')
const values = require('lodash.values')
const groupBy = require('lodash.groupby')
const pullAllWith = require('lodash.pullallwith')

const log = debug('bitswap:engine')
log.error = debug('bitswap:engine:error')

const Message = require('../message')
const Wantlist = require('../wantlist')
const Ledger = require('./ledger')

module.exports = class Engine {
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
    const msg = new Message(false)
    env.blocks.forEach((block) => {
      msg.addBlockWithKey(block.block, block.key)
    })

    // console.log('sending %s blocks', msg.blocks.size)
    this.network.sendMessage(env.peer, msg, (err) => {
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
    const keys = entries.map((e) => e.key)
    const uniqKeys = uniqWith(keys, (a, b) => a.equals(b))
    const groupedTasks = groupBy(tasks, (task) => task.target.toB58String())

    waterfall([
      (cb) => map(uniqKeys, (k, cb) => {
        pull(
          this.blockstore.getStream(k),
          pull.collect((err, blocks) => {
            if (err) {
              return cb(err)
            }
            cb(null, {
              key: k,
              block: blocks[0]
            })
          })
        )
      }, cb),
      (blocks, cb) => each(values(groupedTasks), (tasks, cb) => {
        // all tasks have the same target
        const peer = tasks[0].target
        const blockList = keys.map((k) => {
          return find(blocks, (b) => b.key.equals(k))
        })

        this._sendBlocks({
          peer: peer,
          blocks: blockList
        }, (err) => {
          if (err) {
            log.error('failed to send', err)
          }
          blockList.forEach((block) => {
            this.messageSent(peer, block.block, block.key)
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
    if (!this.ledgerMap.has(peerId.toB58String())) {
      return new Map()
    }

    return this.ledgerMap.get(peerId.toB58String()).wantlist.sortedEntries()
  }

  peers () {
    return Array.from(this.ledgerMap.values()).map((l) => l.partner)
  }

  receivedBlocks (keys) {
    if (!keys.length) {
      return
    }
    // Check all connected peers if they want the block we received
    for (let l of this.ledgerMap.values()) {
      keys
        .map((k) => l.wantlistContains(k))
        .filter(Boolean)
        .forEach((e) => {
          // this.peerRequestQueue.push(e, l.partner)
          this._tasks.push({
            entry: e,
            target: l.partner
          })
        })
    }
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

    this._processBlocks(msg.blocks, ledger, (err) => {
      if (err) {
        log.error(`failed to process blocks: ${err.message}`)
      }

      if (msg.wantlist.size === 0) {
        return cb()
      }

      let cancels = []
      let wants = []
      for (let entry of msg.wantlist.values()) {
        if (entry.cancel) {
          ledger.cancelWant(entry.key)
          cancels.push(entry)
        } else {
          ledger.wants(entry.key, entry.priority)
          wants.push(entry)
        }
      }

      this._cancelWants(ledger, peerId, cancels)
      this._addWants(ledger, peerId, wants, cb)
    })
  }

  _cancelWants (ledger, peerId, entries) {
    const id = peerId.toB58String()

    pullAllWith(this._tasks, entries, (t, e) => {
      const sameTarget = t.target.toB58String() === id
      const sameKey = t.entry.key.equals(e.key)
      return sameTarget && sameKey
    })
  }

  _addWants (ledger, peerId, entries, cb) {
    each(entries, (entry, cb) => {
      // If we already have the block, serve it
      this.blockstore.has(entry.key, (err, exists) => {
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
    map(blocks.values(), (block, cb) => {
      block.key((err, key) => {
        if (err) {
          return cb(err)
        }
        log('got block (%s bytes)', block.data.length)
        ledger.receivedBytes(block.data.length)

        cb(null, key)
      })
    }, (err, keys) => {
      if (err) {
        return callback(err)
      }

      this.receivedBlocks(keys)
      callback()
    })
  }

  // Clear up all accounting things after message was sent
  messageSent (peerId, block, key) {
    const ledger = this._findOrCreate(peerId)
    ledger.sentBytes(block ? block.data.length : 0)
    if (key) {
      ledger.wantlist.remove(key)
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
    // in the peerrequestqueue
  }

  _findOrCreate (peerId) {
    if (this.ledgerMap.has(peerId.toB58String())) {
      return this.ledgerMap.get(peerId.toB58String())
    }

    const l = new Ledger(peerId)
    this.ledgerMap.set(peerId.toB58String(), l)

    return l
  }

  start () {
    this._running = true
  }

  stop () {
    this._running = false
  }
}
