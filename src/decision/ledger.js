'use strict'

const Wantlist = require('../wantlist')

module.exports = class Ledger {
  constructor (peerId) {
    this.partner = peerId
    this.wantlist = new Wantlist()

    this.exchangeCount = 0
    this.sentToPeer = new Map()

    this.accounting = {
      bytesSent: 0,
      bytesRecv: 0
    }
  }

  sentBytes (n) {
    this.exchangeCount ++
    this.lastExchange = (new Date()).getTime()
    this.accounting.bytesSent += n
  }

  receivedBytes (n) {
    this.exchangeCount ++
    this.lastExchange = (new Date()).getTime()
    this.accounting.bytesRecv += n
  }

  wants (key, priority) {
    this.wantlist.add(key, priority)
  }

  cancelWant (key) {
    this.wantlist.remove(key)
  }

  wantlistContains (key) {
    return this.wantlist.contains(key)
  }
}
