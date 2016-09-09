'use strict'

const debug = require('debug')
const mh = require('multihashes')
const pull = require('pull-stream')
const generate = require('pull-generate')

const log = debug('bitswap:engine')
log.error = debug('bitswap:engine:error')

const Message = require('../message')
const Wantlist = require('../wantlist')
const PeerRequestQueue = require('./peer-request-queue')
const Ledger = require('./ledger')

module.exports = class Engine {
  constructor (blockstore, network) {
    this.blockstore = blockstore
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

    const doIt = (cb) => pull(
      generate(null, (state, cb) => {
        log('generating', this._running)
        if (!this._running) {
          return cb(true)
        }

        const nextTask = this.peerRequestQueue.pop()
        log('got task', nextTask)
        if (!nextTask) {
          return cb(true)
        }

        pull(
          this.blockstore.getStream(nextTask.entry.key),
          pull.collect((err, blocks) => {
            log('generated', blocks)
            const block = blocks[0]
            if (err || !block) {
              nextTask.done()
              return cb(null, false)
            }

            cb(null, {
              peer: nextTask.target,
              block: block,
              sent: () => {
                nextTask.done()
              }
            })
          })
        )
      }),
      pull.filter(Boolean),
      pull.asyncMap(this._sendBlock.bind(this)),
      pull.onEnd(cb)
    )

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
    const ledger = this._findOrCreate(peerId)

    if (msg.empty) {
      log('received empty message from %s', peerId.toB58String())
      return cb()
    }

    // If the message was a full wantlist clear the current one
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    this._processBlocks(msg.blocks, ledger)
    log('wantlist', Array.from(msg.wantlist.values()).map((e) => e.toString()))

    pull(
      pull.values(Array.from(msg.wantlist.values())),
      pull.asyncMap((entry, cb) => {
        this._processWantlist(ledger, peerId, entry, cb)
      }),
      pull.onEnd((err) => {
        if (err) return cb(err)
        this._outbox()
        cb()
      })
    )
  }

  receivedBlock (key) {
    this._processBlock(key)
    this._outbox()
  }

  _processBlock (key) {
    // Check all connected peers if they want the block we received
    for (let l of this.ledgerMap.values()) {
      const entry = l.wantlistContains(key)

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
      setImmediate(() => cb())
    } else {
      log('wants %s - %s', mh.toB58String(entry.key), entry.priority)
      ledger.wants(entry.key, entry.priority)

      // If we already have the block, serve it
      this.blockstore.has(entry.key, (err, exists) => {
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

      this.receivedBlock(block.key)
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
