'use strict'

const WantlistEntry = require('../wantlist').Entry

module.exports = class BitswapMessageEntry {
  constructor (cid, priority, cancel) {
    this.entry = new WantlistEntry(cid, priority)
    this.cancel = Boolean(cancel)
  }

  get cid () {
    return this.entry.cid
  }

  set cid (cid) {
    this.entry.cid = cid
  }

  get priority () {
    return this.entry.priority
  }

  set priority (val) {
    this.entry.priority = val
  }

  get [Symbol.toStringTag] () {
    const cidStr = this.cid.toString('base58btc')
    return `BitswapMessageEntry ${cidStr} <cancel: ${this.cancel}, priority: ${this.priority}>`
  }

  equals (other) {
    return (this.cancel === other.cancel) &&
           this.entry.equals(other.entry)
  }
}
