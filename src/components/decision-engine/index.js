'use strict'

const debug = require('debug')
const pull = require('pull-stream')
const each = require('async/each')
const waterfall = require('async/waterfall')
const map = require('async/map')
const debounce = require('lodash.debounce')
const uniqWith = require('lodash.uniqwith')
const find = require('lodash.find')
const values = require('lodash.values')
const groupBy = require('lodash.groupby')
const pullAllWith = require('lodash.pullallwith')
const CID = require('cids')

const log = debug('bitswap:engine')
log.error = debug('bitswap:engine:error')

const Message = require('../../types/message')
const Wantlist = require('../../types/wantlist')
const Ledger = require('./ledger')

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
    const msg = new Message(false)

    env.blocks.forEach((b) => {
      msg.addBlock(b.cid, b.block)
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
    const cids = entries.map((e) => e.cid)
    const uniqCids = uniqWith(cids, (a, b) => a.equals(b))
    const groupedTasks = groupBy(tasks, (task) => task.target.toB58String())

    waterfall([
      (cb) => map(uniqCids, (cid, cb) => {
        pull(
          this.blockstore.getStream(cid.multihash),
          pull.collect((err, blocks) => {
            if (err) {
              return cb(err)
            }
            cb(null, {
              cid: cid,
              block: blocks[0]
            })
          })
        )
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
            this.messageSent(peer, block.block, block.cid)
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
    for (let l of this.ledgerMap.values()) {
      cids
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
          ledger.cancelWant(entry.cid)
          cancels.push(entry)
        } else {
          ledger.wants(entry.cid, entry.priority)
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
      const sameCid = t.entry.cid.equals(e.cid)
      return sameTarget && sameCid
    })
  }

  _addWants (ledger, peerId, entries, cb) {
    each(entries, (entry, cb) => {
      // If we already have the block, serve it
      this.blockstore.has(entry.cid.multihash, (err, exists) => {
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

        cb(null, new CID(key))
      })
    }, (err, cids) => {
      if (err) {
        return callback(err)
      }

      this.receivedBlocks(cids)
      callback()
    })
  }

  // Clear up all accounting things after message was sent
  messageSent (peerId, block, cid) {
    const ledger = this._findOrCreate(peerId)
    ledger.sentBytes(block ? block.data.length : 0)
    if (cid) {
      ledger.wantlist.remove(cid)
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
