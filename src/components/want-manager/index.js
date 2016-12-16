'use strict'

const debug = require('debug')
const pull = require('pull-stream')

const Message = require('../../types/message')
const Wantlist = require('../../types/wantlist')
const CONSTANTS = require('../../constants')
const MsgQueue = require('./msg-queue')

const log = debug('bitswap:wantmanager')
log.error = debug('bitswap:wantmanager:error')

module.exports = class WantManager {
  constructor (network) {
    this.peers = new Map()
    this.wantlist = new Wantlist()

    this.network = network
  }

  _newMsgQueue (peerId) {
    return new MsgQueue(peerId, this.network)
  }

  _addEntries (cids, cancel, force) {
    let i = -1
    pull(
      pull.values(cids),
      pull.map((cid) => {
        i++
        return new Message.Entry(cid, CONSTANTS.kMaxPriority - i, cancel)
      }),
      pull.through((entry) => {
        // add changes to our wantlist
        if (entry.cancel) {
          if (force) {
            this.wantlist.removeForce(entry.cid)
          } else {
            this.wantlist.remove(entry.cid)
          }
        } else {
          log('adding to wantlist',
            entry.cid.toBaseEncodedString(), entry.priority)
          this.wantlist.add(entry.cid, entry.priority)
        }
      }),
      pull.collect((err, entries) => {
        if (err) {
          throw err
        }
        // broadcast changes
        for (let p of this.peers.values()) {
          p.addEntries(entries, false)
        }
      })
    )
  }

  _startPeerHandler (peerId) {
    let mq = this.peers.get(peerId.toB58String())

    if (mq) {
      mq.refcnt ++
      return
    }

    mq = this._newMsgQueue(peerId)

    // new peer, give them the full wantlist
    const fullwantlist = new Message(true)

    for (let entry of this.wantlist.entries()) {
      fullwantlist.addEntry(entry[1].cid, entry[1].priority)
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
  wantBlocks (cids) {
    log('want blocks:', cids.map((cid) => cid.toBaseEncodedString()))
    this._addEntries(cids, false)
  }

  // remove blocks of all the given keys without respecting refcounts
  unwantBlocks (cids) {
    log('unwant blocks:', cids.map((cid) => cid.toBaseEncodedString()))
    this._addEntries(cids, true, true)
  }

  // cancel wanting all of the given keys
  cancelWants (cids) {
    log('cancel wants: ', cids.map((cid) => cid.toBaseEncodedString()))
    this._addEntries(cids, true)
  }

  // Returns a list of all currently connected peers
  connectedPeers () {
    return Array.from(this.peers.keys())
  }

  connected (peerId) {
    log('peer connected: %s', peerId.toB58String())
    this._startPeerHandler(peerId)
  }

  disconnected (peerId) {
    log('peer disconnected: %s', peerId.toB58String())
    this._stopPeerHandler(peerId)
  }

  run () {
    this.timer = setInterval(() => {
      // resend entirew wantlist every so often
      const fullwantlist = new Message(true)
      for (let entry of this.wantlist.entries()) {
        fullwantlist.addEntry(entry[1].cid, entry[1].priority)
      }

      this.peers.forEach((p) => {
        p.addMessage(fullwantlist)
      })
    }, 10 * 1000)
  }

  stop () {
    for (let mq of this.peers.values()) {
      this.disconnected(mq.p)
    }
    clearInterval(this.timer)
  }
}
