'use strict'

const async = require('async')
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

    // For now array, figure out sth better
    this.incoming = []
    this.connect = []
    this.disconnect = []
  }

  _newMsgQueue (peerId) {
    return new MsgQueue(peerId, this.network)
  }

  _addEntries (keys, cancel) {
    this.incoming = this.incoming.concat(keys.map((key, i) => {
      return new Message.Entry(key, cs.kMaxPriority - i, cancel)
    }))
  }

  _startPeerHandler (peerId) {
    let mq = this.peers.get(peerId)

    if (mq) {
      mq.refcnt ++
      return
    }

    mq = this._newMsgQueue(peerId)

    // new peer, give them the full wantlist
    const fullwantlist = new Message(true)
    for (let entry of this.wl.entries()) {
      fullwantlist.addEntry(entry.key, entry.priority)
    }
    mq.addMessage(fullwantlist)

    this.peers.set(peerId, mq)
    mq.run()
    return mq
  }

  _stopPeerHandler (peerId) {
    const mq = this.peers.get(peerId)

    if (!mq) {
      return
    }

    mq.refcnt --
    if (mq.refcnt > 0) {
      return
    }

    mq.stop()
    this.peers.delete(peerId)
  }

  // add all the keys to the wantlist
  wantBlocks (keys) {
    log('want blocks:', keys)
    this._addEntries(keys, false)
  }

  // cancel wanting all of the given keys
  cancelWants (keys) {
    this._addEntries(keys, true)
  }

  // Returns a list of all currently connected peers
  connectedPeers () {
    return Array.from(this.peers.keys())
  }

  sendBlock (env, cb) {
    const msg = new Message(false)
    msg.addBlock(env.block)

    log('Sending block %s to %s', env.peer.toHexString(), env.block)

    this.network.sendMessage(env.peer, msg, (err) => {
      if (err) {
        log('sendblock error: %s', err.message)
      }
      cb()
    })
  }

  connected (peerId) {
    this.connect.push(peerId)
  }

  disconnected (peerId) {
    this.disconnect.push(peerId)
  }

  run () {
    const timer = {
      start () {
        this.expired = false
        setTimeout(() => {
          this.expired = true
        }, cs.rebroadcastDelay)
      },
      expired: false
    }

    async.forever((cb) => {
      const next = () => async.setImmediate(cb)

      if (this.incoming.length > 0) {
        const entries = this.incoming
        this.incoming = []

        // add changes to our wantlist
        entries.forEach((e) => {
          if (e.cancel) {
            this.wl.remove(e.key)
          } else {
            this.wl.add(e.key, e.priority)
          }
        })

        // broadcast changes
        for (let p of this.peers.values()) {
          p.addEntries(entries)
        }

        next()
      } else if (this.connect.length > 0) {
        const peers = this.connect
        this.connect = []

        peers.forEach((p) => {
          this._startPeerHandler(p)
        })

        next()
      } else if (this.disconnect.length > 0) {
        const peers = this.disconnect
        this.disconnect = []

        peers.forEach((p) => {
          this._stopPeerHandler(p)
        })

        next()
      } else if (timer.expired) {
        // resend entirew wantlist every so often
        const es = []
        for (let e of this.wl.entries()) {
          es.push(new Message.Entry(e.key, e.priority))
        }

        this.peers.forEach((p) => {
          p.addEntries(es, true)
        })
        timer.start()
        next()
      } else {
        next()
      }
    }, (err) => {
      log('oh no: ', err.message)
    })
  }
}
