'use strict'

const debug = require('debug')

const Message = require('../message')
const Wantlist = require('../wantlist')
const cs = require('../constants')
const MsgQueue = require('./msg-queue')

const log = debug('bitswap:wantmanager')
log.error = debug('bitswap:wantmanager:error')

module.exports = class Wantmanager {
  constructor (network) {
    this.peers = new Map()
    this.wl = new Wantlist()

    this.network = network
  }

  _addEntries (keys, cancel, force) {
    const entries = keys.map((key, i) => {
      return new Message.Entry(key, cs.kMaxPriority - i, cancel)
    })

    entries.forEach((e) => {
      // add changes to our wantlist
      if (e.cancel) {
        if (force) {
          this.wl.removeForce(e.key)
        } else {
          this.wl.remove(e.key)
        }
      } else {
        log('adding to wl')
        this.wl.add(e.key, e.priority)
      }
    })

    // broadcast changes
    for (let p of this.peers.values()) {
      p.addEntries(entries)
    }
  }

  _startPeerHandler (peerId) {
    let mq = this.peers.get(peerId.toB58String())

    if (mq) {
      mq.refcnt ++
      return
    }

    mq = new MsgQueue(peerId, this.network)

    // new peer, give them the full wantlist
    const fullwantlist = new Message(true)
    for (let entry of this.wl.entries()) {
      fullwantlist.addEntry(entry[1].key, entry[1].priority)
    }

    mq.addMessage(fullwantlist)

    this.peers.set(peerId.toB58String(), mq)
    mq.run()
    return mq
  }

  _stopPeerHandler (peerId) {
    const mq = this.peers.get(peerId.toB58String())

    if (!mq) {
      return
    }

    mq.refcnt --
    if (mq.refcnt > 0) {
      return
    }

    mq.stop()
    this.peers.delete(peerId.toB58String())
  }

  // add all the keys to the wantlist
  wantBlocks (keys) {
    this._addEntries(keys, false)
  }

  // remove blocks of all the given keys without respecting refcounts
  unwantBlocks (keys) {
    log('unwant blocks: %s', keys.length)
    this._addEntries(keys, true, true)
  }

  // cancel wanting all of the given keys
  cancelWants (keys) {
    log('cancel wants: %s', keys.length)
    this._addEntries(keys, true)
  }

  // Returns a list of all currently connected peers
  connectedPeers () {
    return Array.from(this.peers.keys())
  }

  connected (peerId) {
    this._startPeerHandler(peerId)
  }

  disconnected (peerId) {
    this._stopPeerHandler(peerId)
  }

  run () {
    this.timer = setInterval(() => {
      // resend entirew wantlist every so often
      const fullwantlist = new Message(true)
      for (let entry of this.wl.entries()) {
        fullwantlist.addEntry(entry[1].key, entry[1].priority)
      }

      this.peers.forEach((p) => {
        p.addMessage(fullwantlist)
      })
    }, 10 * 1000)
  }

  stop () {
    for (let mq of this.peers.values()) {
      this.disconnected(mq.id)
    }
    clearInterval(this.timer)
  }
}
