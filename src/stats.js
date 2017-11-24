'use strict'

const EventEmitter = require('events')

class Stats extends EventEmitter {
  constructor (initialCounters, updateInterval) {
    super()

    if (typeof updateInterval !== 'number') {
      throw new Error('need updateInterval')
    }

    this._updateInterval = updateInterval
    this._queue = []
    this._stats = {}

    initialCounters.forEach((key) => this._stats[key] = 0)
  }

  start () {
    this._startUpdater()
  }

  get snapshot () {
    return this._stats
  }

  push (counter, inc) {
    this._queue.push([counter, inc])
  }

  _startUpdater () {
    if (!this._updater) {
      this._updater = setInterval(this._update.bind(this), this._updateInterval)
    }
  }

  _update () {
    if (this._queue.length) {
      while (this._queue.length) {
        const op = this._queue.shift()
        this._applyOp(op)
      }
      this.emit('update', this._stats)
    }
  }

  _applyOp (op) {
    const key = op[0]
    const inc = op[1]

    if (typeof inc !== 'number') {
      throw new Error('invalid increment number:', inc)
    }

    if (!this._stats.hasOwnProperty(key)) {
      this._stats[key] = 0
    }
    this._stats[key] += inc
  }


  stop () {
    if (this._updater) {
      clearInterval(this._updater)
      this._updater = null
    }
  }
}

module.exports = Stats
