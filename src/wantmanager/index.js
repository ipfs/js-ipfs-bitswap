'use strict'

const debug = require('debug')
const pull = require('pull-stream')
const mh = require('multihashes')

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

  _newMsgQueue (peerId) {
    return new MsgQueue(peerId, this.network)
  }

  _addEntries (keys, cancel, force) {
    let i = -1
    pull(
      pull.values(keys),
      pull.map((key) => {
        i++
        return new Message.Entry(key, cs.kMaxPriority - i, cancel)
      }),
      pull.through((e) => {
        // add changes to our wantlist
        if (e.cancel) {
          if (force) {
            this.wl.removeForce(e.key)
          } else {
            this.wl.remove(e.key)
          }
        } else {
          log('adding to wl', mh.toB58String(e.key), e.priority)
          this.wl.add(e.key, e.priority)
        }
      }),
      pull.collect((err, entries) => {
        if (err) throw err
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
    log('want blocks:', keys.map((k) => mh.toB58String(k)))
    this._addEntries(keys, false)
  }

  // remove blocks of all the given keys without respecting refcounts
  unwantBlocks (keys) {
    log('unwant blocks:', keys.map((k) => mh.toB58String(k)))
    this._addEntries(keys, true, true)
  }

  // cancel wanting all of the given keys
  cancelWants (keys) {
    log('cancel wants: ', keys.map((k) => mh.toB58String(k)))
    this._addEntries(keys, true)
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
    // TODO: is this needed? if so enable it
    //     // resend entirew wantlist every so often
    //     const es = []
    //     for (let e of this.wl.entries()) {
    //       es.push(new Message.Entry(e.key, e.priority))
    //     }

    //     this.peers.forEach((p) => {
    //       p.addEntries(es, true)
    //     })
    //     timer.start()
    //   }
    // }
  }

  stop () {
    for (let mq of this.peers.values()) {
      this.disconnected(mq.p)
    }
  }
}
