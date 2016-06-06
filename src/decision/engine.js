'use strict'

const debug = require('debug')
const _ = require('highland')
const async = require('async')
const mh = require('multihashes')

const log = debug('bitswap:engine')
log.error = debug('bitswap:engine:error')

const Message = require('../message')
const Wantlist = require('../wantlist')
const PeerRequestQueue = require('./peer-request-queue')
const Ledger = require('./ledger')

module.exports = class Engine {
  constructor (datastore, network) {
    this.datastore = datastore
    this.network = network

    // A list of of ledgers by their partner id
    this.ledgerMap = new Map()

    // A priority queue of requests received from different
    // peers.
    this.peerRequestQueue = new PeerRequestQueue()

    this._running = false
  }

  _sendBlock (env, cb) {
    const msg = new Message(false)
    msg.addBlock(env.block)

    log('Sending block to %s', env.peer.toB58String(), env.block.data.toString())

    this.network.sendMessage(env.peer, msg, (err) => {
      if (err) {
        log('sendblock error: %s', err.message)
      }
      cb(null, 'done')
    })
  }

  _outbox () {
    if (!this._running) return

    const doIt = (cb) => {
      _((push, next) => {
        if (!this._running) return push(null, _.nil)
        const nextTask = this.peerRequestQueue.pop()

        if (!nextTask) return push(null, _.nil)

        this.datastore.get(nextTask.entry.key, (err, block) => {
          if (err || !block) {
            nextTask.done()
          } else {
            push(null, {
              peer: nextTask.target,
              block: block,
              sent: () => {
                nextTask.done()
              }
            })
          }

          next()
        })
      })
        .flatMap((envelope) => {
          return _.wrapCallback(this._sendBlock.bind(this))(envelope)
        })
        .done(cb)
    }

    if (!this._timer) {
      this._timer = setTimeout(() => {
        doIt(() => {
          this._timer = null
        })
      }, 50)
    }
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

  // Handle incoming messages
  messageReceived (peerId, msg, cb) {
    if (msg.empty) {
      log('received empty message from %s', peerId.toB58String())
    }

    const ledger = this._findOrCreate(peerId)

    // If the message was a full wantlist clear the current one
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    this._processBlocks(msg.blocks, ledger)
    log('wantlist', Array.from(msg.wantlist.values()).map((e) => e.toString()))
    async.eachSeries(
      msg.wantlist.values(),
      this._processWantlist.bind(this, ledger, peerId),
      (err) => {
        const done = (err) => async.setImmediate(() => cb(err))
        if (err) return done(err)
        this._outbox()
        done()
      }
    )
  }

  receivedBlock (block) {
    this._processBlock(block)
    this._outbox()
  }

  _processBlock (block) {
    // Check all connected peers if they want the block we received
    for (let l of this.ledgerMap.values()) {
      const entry = l.wantlistContains(block.key)

      if (entry) {
        this.peerRequestQueue.push(entry, l.partner)
      }
    }
  }

  _processWantlist (ledger, peerId, entry, cb) {
    if (entry.cancel) {
      log('cancel %s', mh.toB58String(entry.key))
      ledger.cancelWant(entry.key)
      this.peerRequestQueue.remove(entry.key, peerId)
      async.setImmediate(() => cb())
    } else {
      log('wants %s - %s', mh.toB58String(entry.key), entry.priority)
      ledger.wants(entry.key, entry.priority)

      // If we already have the block, serve it
      this.datastore.has(entry.key, (err, exists) => {
        if (err) {
          log('failed existence check %s', mh.toB58String(entry.key))
        } else if (exists) {
          log('has want %s', mh.toB58String(entry.key))
          this.peerRequestQueue.push(entry.entry, peerId)
        }
        cb()
      })
    }
  }

  _processBlocks (blocks, ledger) {
    for (let block of blocks.values()) {
      log('got block %s (%s bytes)', mh.toB58String(block.key), block.data.length)
      ledger.receivedBytes(block.data.length)

      this.receivedBlock(block)
    }
  }

  // Clear up all accounting things after message was sent
  messageSent (peerId, msg) {
    const ledger = this._findOrCreate(peerId)
    for (let block of msg.blocks.values()) {
      ledger.sentBytes(block.data.length)
      ledger.wantlist.remove(block.key)
      this.peerRequestQueue.remove(block.key, peerId)
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
