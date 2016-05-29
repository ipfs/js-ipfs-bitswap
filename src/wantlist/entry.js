'use strict'

const assert = require('assert')
const isUndefined = require('lodash.isundefined')
const mh = require('multihashes')

module.exports = class WantlistEntry {
  constructor (key, priority) {
    assert(Buffer.isBuffer(key), 'key must be a buffer')
    // Keep track of how many requests we have for this key
    this._refCounter = 1

    this.key = key
    this.priority = isUndefined(priority) ? 1 : priority
  }

  inc () {
    this._refCounter += 1
  }

  dec () {
    this._refCounter = Math.max(0, this._refCounter - 1)
  }

  hasRefs () {
    return this._refCounter > 0
  }

  get [Symbol.toStringTag] () {
    return `WantlistEntry <key: ${mh.toB58String(this.key)}, priority: ${this.priority}, refs: ${this._refCounter}>`
  }

  equals (other) {
    return (this._refCounter === other._refCounter) &&
      this.key.equals(other.key) &&
      this.priority === other.priority
  }
}
