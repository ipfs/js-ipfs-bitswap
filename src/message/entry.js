'use strict'

const mh = require('multihashes')

const WantlistEntry = require('../wantlist').Entry

module.exports = class BitswapMessageEntry {
  constructor (key, priority, cancel) {
    this.entry = new WantlistEntry(key, priority)
    this.cancel = Boolean(cancel)
  }

  get key () {
    return this.entry.key
  }

  set key (val) {
    this.entry.key = val
  }

  get priority () {
    return this.entry.priority
  }

  set priority (val) {
    this.entry.priority = val
  }

  get [Symbol.toStringTag] () {
    return `BitswapMessageEntry ${mh.toB58String(this.key)} <cancel: ${this.cancel}, priority: ${this.priority}>`
  }

  equals (other) {
    return (this.cancel === other.cancel) && this.entry.equals(other.entry)
  }
}
