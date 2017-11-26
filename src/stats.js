'use strict'

const EventEmitter = require('events')
const Big = require('big.js')

class Stats extends EventEmitter {
  constructor (initialCounters, options) {
    super()

    if (typeof options.computeThrottleTimeout !== 'number') {
      throw new Error('need computeThrottleTimeout')
    }

    if (typeof options.computeThrottleMaxQueueSize !== 'number') {
      throw new Error('need computeThrottleMaxQueueSize')
    }

    this._options = options
    this._queue = []
    this._stats = {}

    this._update = this._update.bind(this)

    initialCounters.forEach((key) => { this._stats[key] = Big(0) })
  }

  get snapshot () {
    return Object.assign({}, this._stats)
  }

  push (counter, inc) {
    this._queue.push([counter, inc])
    if (this._queue.length <= this._options.computeThrottleMaxQueueSize) {
      this._resetComputeTimeout()
    } else {
      if (this._timeout) {
        clearTimeout(this._timeout)
      }
      this._update()
    }
  }

  _resetComputeTimeout () {
    if (this._timeout) {
      clearTimeout(this._timeout)
    }
    this._timeout = setTimeout(this._update, this._options.computeThrottleTimeout)
  }

  _update () {
    this._timeout = null
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

    let n

    if (!this._stats.hasOwnProperty(key)) {
      n = this._stats[key] = Big(0)
    } else {
      n = this._stats[key]
    }
    this._stats[key] = n.plus(inc)
  }
}

module.exports = Stats
