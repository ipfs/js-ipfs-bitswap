'use strict'

const { EventEmitter } = require('events')
const Stat = require('./stat')

/**
 * @typedef {import('cids')} CID
 * @typedef {import('peer-id')} PeerId
 */

/**
 * @typedef {[number, number, number]} AverageIntervals
 */
const defaultOptions = {
  enabled: false,
  computeThrottleTimeout: 1000,
  computeThrottleMaxQueueSize: 1000,
  movingAverageIntervals: /** @type {AverageIntervals} */ ([
    60 * 1000, // 1 minute
    5 * 60 * 1000, // 5 minutes
    15 * 60 * 1000 // 15 minutes
  ])
}

class Stats extends EventEmitter {
  /**
   * @param {string[]} [initialCounters]
   * @param {Object} _options
   * @param {boolean} _options.enabled
   * @param {number} _options.computeThrottleTimeout
   * @param {number} _options.computeThrottleMaxQueueSize
   */
  constructor (initialCounters = [], _options = defaultOptions) {
    super()

    const options = Object.assign({}, defaultOptions, _options)

    if (typeof options.computeThrottleTimeout !== 'number') {
      throw new Error('need computeThrottleTimeout')
    }

    if (typeof options.computeThrottleMaxQueueSize !== 'number') {
      throw new Error('need computeThrottleMaxQueueSize')
    }

    this._initialCounters = initialCounters
    this._options = options
    this._enabled = this._options.enabled

    this._global = new Stat(initialCounters, options)
    this._global.on('update', (stats) => this.emit('update', stats))

    /** @type {Map<string, Stat>} */
    this._peers = new Map()
  }

  enable () {
    this._enabled = true
    this._options.enabled = true
    this._global.enable()
  }

  disable () {
    this._enabled = false
    this._options.enabled = false
    this._global.disable()
  }

  stop () {
    this._enabled = false
    this._global.stop()
    for (const peerStat of this._peers) {
      peerStat[1].stop()
    }
  }

  get snapshot () {
    return this._global.snapshot
  }

  get movingAverages () {
    return this._global.movingAverages
  }

  /**
   * @param {PeerId|string} peerId
   * @returns {Stat|void}
   */
  forPeer (peerId) {
    const peerIdStr = (typeof peerId !== 'string' && peerId.toB58String)
      ? peerId.toB58String()
      : `${peerId}`

    return this._peers.get(peerIdStr)
  }

  /**
   *
   * @param {string|null} peer
   * @param {string} counter
   * @param {number} inc
   */
  push (peer, counter, inc) {
    if (this._enabled) {
      this._global.push(counter, inc)

      if (peer) {
        let peerStats = this._peers.get(peer)
        if (!peerStats) {
          peerStats = new Stat(this._initialCounters, this._options)
          this._peers.set(peer, peerStats)
        }

        peerStats.push(counter, inc)
      }
    }
  }

  /**
   * @param {PeerId} peer
   */
  disconnected (peer) {
    const peerId = peer.toB58String()
    const peerStats = this._peers.get(peerId)
    if (peerStats) {
      peerStats.stop()
      this._peers.delete(peerId)
    }
  }
}

module.exports = Stats
