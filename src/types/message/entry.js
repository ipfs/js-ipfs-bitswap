'use strict'

const WantlistEntry = require('../wantlist').Entry

module.exports = class BitswapMessageEntry {
  /**
   * @param {import('cids')} cid
   * @param {number} priority
   * @param {import('./message').Message.Wantlist.WantType} wantType
   * @param {boolean} [cancel]
   * @param {boolean} [sendDontHave]
   */
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

  /**
   * @param {this} other
   */
  equals (other) {
    return (this.cancel === other.cancel) &&
           (this.sendDontHave === other.sendDontHave) &&
           (this.wantType === other.wantType) &&
           this.entry.equals(other.entry)
  }
}
