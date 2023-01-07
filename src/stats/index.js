import { EventEmitter } from 'events'
import { Stat } from './stat.js'
import { trackedMap } from '@libp2p/tracked-map'

/**
 * @typedef {import('multiformats').CID} CID
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
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

export class Stats extends EventEmitter {
  /**
   * @param {import('@libp2p/interface-libp2p').Libp2p} libp2p
   * @param {string[]} [initialCounters]
   * @param {object} _options
   * @param {boolean} _options.enabled
   * @param {number} _options.computeThrottleTimeout
   * @param {number} _options.computeThrottleMaxQueueSize
   */
  constructor (libp2p, initialCounters = [], _options = defaultOptions) {
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
    this._peers = trackedMap({
      name: 'ipfs_bitswap_stats_peers',
      metrics: libp2p.metrics
    })
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
   * @returns {Stat|undefined}
   */
  forPeer (peerId) {
    const peerIdStr = (typeof peerId !== 'string' && peerId.toString)
      ? peerId.toString()
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
    const peerId = peer.toString()
    const peerStats = this._peers.get(peerId)
    if (peerStats) {
      peerStats.stop()
      this._peers.delete(peerId)
    }
  }
}
