'use strict'

const debug = require('debug')
const log = debug('engine')
log.error = debug('engine:error')

const Wantlist = require('../wantlist')
const PeerRequestQueue = require('./peer-request-queue')
const Ledger = require('./ledger')

module.exports = class Engine {
  constructor (blockStore) {
    this.blockStore = blockStore

    // A list of of ledgers by their partner id
    this.ledgerMap = new Map()

    // A priority queue of requests received from different
    // peers.
    this.peerRequestQueue = new PeerRequestQueue()
  }

  messageReceived (peerId, msg) {
    if (msg.empty) {
      log('received empty message from %s', peerId)
    }

    const ledger = this._findOrCreate(peerId)

    // If the message was a full wantlist clear the current one
    if (msg.full) {
      ledger.wantlist = new Wantlist()
    }

    for (let entry of msg.wantlist.values()) {
      if (entry.cancel) {
        log('cancel %s', entry.key)
        ledger.cancelWant(entry.key)
        this.peerRequestQueue.remove(entry.key, peerId)
      } else {
        log('wants %s - %s', entry.key, entry.priority)
        ledger.wants(entry.key, entry.priority)

        // If we already have the block, serve it
        if (this.blockStore.has(entry.key)) {
          this.peerRequestQueue.push(entry.entry, peerId)
        }
      }
    }

    for (let block of msg.blocks.values()) {
      log('got block %s %s bytes', block.key, block.data.length)
      ledger.receivedBytes(block.data.length)

      // Check all connected peers if they want the block we received
      for (let l of this.ledgerMap.values()) {
        const entry = l.wantlistContains(block.key)

        if (entry) {
          this.peerRequestQueue.push(entry, ledger.partner)
        }
      }
    }
  }

  _findOrCreate (peerId) {
    if (this.ledgerMap.has(peerId)) {
      return this.ledgerMap(peerId)
    }

    const l = new Ledger(peerId)
    this.ledgerMap.add(peerId, l)

    return l
  }
}
