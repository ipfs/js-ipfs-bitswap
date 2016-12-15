'use strict'

const debug = require('debug')
const pull = require('pull-stream')
const setImmediate = require('async/setImmediate')
const each = require('async/each')
const map = require('async/map')
const waterfall = require('async/waterfall')
const debounce = require('lodash.debounce')
const uniqWith = require('lodash.uniqwith')
const filter = require('lodash.filter')
const find = require('lodash.find')

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

  _sendBlock (env, cb) {
    const msg = new Message(false)
    msg.addBlockWithKey(env.block, env.key)

    this.network.sendMessage(env.peer, msg, (err) => {
      if (err) {
        log('sendblock error: %s', err.message)
      }
      cb()
    })
  }

  _processTasks () {
    if (!this._running || !this._tasks.length) return

    const tasks = this._tasks
    this._tasks = []
    const entries = tasks.map((t) => t.entry)
    const keys = entries.map((e) => e.key)
    const uniqKeys = uniqWith(keys, (a, b) => a.equals(b))

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
      (blocks, cb) => each(tasks, (task, cb) => {
        const key = task.entry.key
        const block = find(blocks, (b) => b.key.equals(key))
        this._sendBlock({
          peer: task.target,
          block: block.block,
          key: key
        }, (err) => {
          if (err) {
            log.error('failed to send', err)
          }
          this.messageSent(task.target, block.block, key)
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

      each(msg.wantlist.values(), (entry, cb) => {
        this._processWantlist(ledger, peerId, entry, cb)
      }, cb)
    })
  }

  _processWantlist (ledger, peerId, entry, cb) {
    if (entry.cancel) {
      log('cancel')
      ledger.cancelWant(entry.key)

      this._tasks = filter(this._tasks, (e) => {
        return !e.entry.key.equals(entry.key) || e.target.toB58String() !== peerId.toB58String()
      })
      setImmediate(() => cb())
    } else {
      log('wants')
      ledger.wants(entry.key, entry.priority)

      // If we already have the block, serve it
      this.blockstore.has(entry.key, (err, exists) => {
        if (err) {
          log('failed existence check')
        } else if (exists) {
          log('has want')
          this._tasks.push({
            entry: entry.entry,
            target: peerId
          })
          this._outbox()
        }
        cb()
      })
    }
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
