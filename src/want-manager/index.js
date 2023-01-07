
import { BitswapMessage as Message } from '../message/index.js'
import { Wantlist } from '../wantlist/index.js'
import * as CONSTANTS from '../constants.js'
import { MsgQueue } from './msg-queue.js'
import { logger } from '../utils/index.js'
import { base58btc } from 'multiformats/bases/base58'
import { trackedMap } from '@libp2p/tracked-map'

/**
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 * @typedef {import('multiformats').CID} CID
 */

export class WantManager {
  /**
   * @param {PeerId} peerId
   * @param {import('../network').Network} network
   * @param {import('../stats').Stats} stats
   * @param {import('@libp2p/interface-libp2p').Libp2p} libp2p
   */
  constructor (peerId, network, stats, libp2p) {
    /** @type {Map<string, MsgQueue>} */
    this.peers = trackedMap({
      name: 'ipfs_bitswap_want_manager_peers',
      metrics: libp2p.metrics
    })
    this.wantlist = new Wantlist(stats, libp2p)

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
    let mq = this.peers.get(peerId.toString())

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

    this.peers.set(peerId.toString(), mq)
    return mq
  }

  /**
   * @private
   * @param {PeerId} peerId
   */
  _stopPeerHandler (peerId) {
    const mq = this.peers.get(peerId.toString())

    if (!mq) {
      return
    }

    mq.refcnt--
    if (mq.refcnt > 0) {
      return
    }

    this.peers.delete(peerId.toString())
  }

  /**
   * add all the cids to the wantlist
   *
   * @param {CID[]} cids
   * @param {object} [options]
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
