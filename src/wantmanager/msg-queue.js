'use strict'

const debug = require('debug')
const debounce = require('lodash.debounce')
const Message = require('../message')

const log = debug('bitswap:wantmanager:queue')
log.error = debug('bitswap:wantmanager:queue:error')

module.exports = class MsgQueue {
  constructor (peerId, network) {
    this.id = peerId
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
    if (!this._entries.length) return

    const msg = new Message(false)
    this._entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.key)
      } else {
        msg.addEntry(entry.key, entry.priority)
      }
    })
    this._entries = []
    this.addMessage(msg)
  }

  send (msg) {
    this.network.connectTo(this.id, (err) => {
      if (err) {
        log.error('cant connect to peer %s: %s', this.id.toB58String(), err.message)
        return
      }
      log('sending message')

      this.network.sendMessage(this.id, msg, (err) => {
        if (err) {
          log.error('send error: %s', err.message)
          return
        }
      })
    })
  }
}
