'use strict'

const assert = require('assert')
const isUndefined = require('lodash.isundefined')
const mh = require('multihashes')

module.exports = class WantlistEntry {
  constructor (key, priority) {
    assert(Buffer.isBuffer(key), 'key must be a buffer')
    // Keep track of how many requests we have for this key
    this._refCounter = 1

    this._key = key
    this.priority = isUndefined(priority) ? 1 : priority
    this._keyB58String = ''
  }

  get key () {
    return this._key
  }

  set key (val) {
    throw new Error('immutable key')
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

  toB58String () {
    if (!this._keyB58String) {
      this._keyB58String = mh.toB58String(this.key)
    }

    return this._keyB58String
  }

  get [Symbol.toStringTag] () {
    return `WantlistEntry <key: ${this.toB58String()}, priority: ${this.priority}, refs: ${this._refCounter}>`
  }

  equals (other) {
    return (this._refCounter === other._refCounter) &&
      this.key.equals(other.key) &&
      this.priority === other.priority
  }
}
