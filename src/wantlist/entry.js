'use strict'

const isUndefined = require('lodash.isundefined')

module.exports = class WantlistEntry {
  constructor (key, priority) {
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
}
