'use strict'

const WantlistEntry = require('../wantlist').Entry

module.exports = class BitswapMessageEntry {
  constructor (cid, priority, wantType, cancel, sendDontHave) {
    this.entry = new WantlistEntry(cid, priority, wantType)
    this.cancel = Boolean(cancel)
    this.sendDontHave = Boolean(sendDontHave)
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

  get wantType () {
    return this.entry.wantType
  }

  set wantType (val) {
    this.entry.wantType = val
  }

  get [Symbol.toStringTag] () {
    const cidStr = this.cid.toString('base58btc')
    return `BitswapMessageEntry ${cidStr} <cancel: ${this.cancel}, priority: ${this.priority}>`
  }

  equals (other) {
    return (this.cancel === other.cancel) &&
           (this.sendDontHave === other.sendDontHave) &&
           (this.wantType === other.wantType) &&
           this.entry.equals(other.entry)
  }
}
