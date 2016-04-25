'use strict'

const isUndefined = require('lodash.isundefined')

module.exports = class WantlistEntry {
  constructor (key, priority) {
    this.key = key
    this.priority = isUndefined(priority) ? 1 : priority
  }
}
