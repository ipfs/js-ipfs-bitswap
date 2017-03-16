'use strict'

const debug = require('debug')
const debounce = require('lodash.debounce')
const Message = require('../../types/message')

const log = debug('bitswap:wantmanager:queue')
log.error = debug('bitswap:wantmanager:queue:error')

module.exports = class MsgQueue {
  constructor (peerId, network) {
    this.peerId = peerId
    this.network = network
    this.refcnt = 1

    this._entries = []
    this.sendEntries = debounce(this._sendEntries.bind(this), 200)
  }

  addMessage (msg) {
    if (msg.empty) {
      return
    }

    this.send(msg)
  }

  addEntries (entries) {
    this._entries = this._entries.concat(entries)
    this.sendEntries()
  }

  _sendEntries () {
    if (!this._entries.length) {
      return
    }

    const msg = new Message(false)
    this._entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.cid)
      } else {
        msg.addEntry(entry.cid, entry.priority)
      }
    })
    this._entries = []
    this.addMessage(msg)
  }

  send (msg) {
    this.network.connectTo(this.peerId, (err) => {
      if (err) {
        log.error('cant connect to peer %s: %s', this.peerId.toB58String(), err.message)
        return
      }
      log('sending message')
      this.network.sendMessage(this.peerId, msg, (err) => {
        if (err) {
          log.error('send error: %s', err.message)
        }
      })
    })
  }
}
