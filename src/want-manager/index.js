
import { BitswapMessage as Message } from '../types/message/index.js'
import { Wantlist } from '../types/wantlist/index.js'
import * as CONSTANTS from '../constants.js'
import { MsgQueue } from './msg-queue.js'
import { logger } from '../utils/index.js'
import { base58btc } from 'multiformats/bases/base58'

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('multiformats').CID} CID
 */

export class WantManager {
  /**
   * @param {PeerId} peerId
   * @param {import('../network').Network} network
   * @param {import('../stats').Stats} stats
   */
  constructor (peerId, network, stats) {
    /** @type {Map<string, MsgQueue>} */
    this.peers = new Map()
    this.wantlist = new Wantlist(stats)

    this.network = network
    this._stats = stats

    this._peerId = peerId
    this._log = logger(peerId, 'want')
  }

  /**
   * @private
   * @param {CID[]} cids
   * @param {boolean} cancel
   * @param {boolean} [force]
   */
  _addEntries (cids, cancel, force) {
    const entries = cids.map((cid, i) => {
      return new Message.Entry(cid, CONSTANTS.kMaxPriority - i, Message.WantType.Block, cancel)
    })

    entries.forEach((e) => {
      // add changes to our wantlist
      if (e.cancel) {
        if (force) {
          this.wantlist.removeForce(e.cid.toString(base58btc))
        } else {
          this.wantlist.remove(e.cid)
        }
      } else {
        this._log('adding to wl')
        // TODO: Figure out the wantType
        // @ts-expect-error - requires wantType
        this.wantlist.add(e.cid, e.priority)
      }
    })

    // broadcast changes
    for (const p of this.peers.values()) {
      p.addEntries(entries)
    }
  }

  /**
   * @private
   * @param {PeerId} peerId
   */
  _startPeerHandler (peerId) {
    let mq = this.peers.get(peerId.toB58String())

    if (mq) {
      mq.refcnt++
      return
    }

    mq = new MsgQueue(this._peerId, peerId, this.network)

    // new peer, give them the full wantlist
    const fullwantlist = new Message(true)

    for (const entry of this.wantlist.entries()) {
      fullwantlist.addEntry(entry[1].cid, entry[1].priority)
    }

    mq.addMessage(fullwantlist)

    this.peers.set(peerId.toB58String(), mq)
    return mq
  }

  /**
   * @private
   * @param {PeerId} peerId
   */
  _stopPeerHandler (peerId) {
    const mq = this.peers.get(peerId.toB58String())

    if (!mq) {
      return
    }

    mq.refcnt--
    if (mq.refcnt > 0) {
      return
    }

    this.peers.delete(peerId.toB58String())
  }

  /**
   * add all the cids to the wantlist
   *
   * @param {CID[]} cids
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   */
  wantBlocks (cids, options = {}) {
    this._addEntries(cids, false)

    if (options && options.signal) {
      options.signal.addEventListener('abort', () => {
        this.cancelWants(cids)
      })
    }
  }

  /**
   * Remove blocks of all the given keys without respecting refcounts
   *
   * @param {CID[]} cids
   */
  unwantBlocks (cids) {
    this._log('unwant blocks: %s', cids.length)
    this._addEntries(cids, true, true)
  }

  /**
   * Cancel wanting all of the given keys
   *
   * @param {CID[]} cids
   */
  cancelWants (cids) {
    this._log('cancel wants: %s', cids.length)
    this._addEntries(cids, true)
  }

  /**
   * Returns a list of all currently connected peers
   */
  connectedPeers () {
    return Array.from(this.peers.keys())
  }

  /**
   * @param {PeerId} peerId
   */
  connected (peerId) {
    this._startPeerHandler(peerId)
  }

  /**
   * @param {PeerId} peerId
   */
  disconnected (peerId) {
    this._stopPeerHandler(peerId)
  }

  start () {
  }

  stop () {
    this.peers.forEach((mq) => this.disconnected(mq.peerId))
  }
}
