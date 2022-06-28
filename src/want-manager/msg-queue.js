
// @ts-ignore
import debounce from 'just-debounce-it'
import { BitswapMessage as Message } from '../message/index.js'
import { logger } from '../utils/index.js'
import { wantlistSendDebounceMs } from '../constants.js'

/**
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 * @typedef {import('multiformats').CID} CID
 * @typedef {import('../network').Network} Network
 */

export class MsgQueue {
  /**
   * @param {PeerId} selfPeerId
   * @param {PeerId} otherPeerId
   * @param {Network} network
   */
  constructor (selfPeerId, otherPeerId, network) {
    this.peerId = otherPeerId
    this.network = network
    this.refcnt = 1

    /**
     * @private
     * @type {{cid:CID, priority:number, cancel?:boolean}[]}
     */
    this._entries = []
    /** @private */
    this._log = logger(selfPeerId, 'msgqueue')
    this.sendEntries = debounce(this._sendEntries.bind(this), wantlistSendDebounceMs)
  }

  /**
   * @param {Message} msg
   */
  addMessage (msg) {
    if (msg.empty) {
      return
    }

    this.send(msg)
  }

  /**
   * @param {{cid:CID, priority:number}[]} entries
   */
  addEntries (entries) {
    this._entries = this._entries.concat(entries)
    this.sendEntries()
  }

  /**
   * @private
   */
  _sendEntries () {
    if (!this._entries.length) {
      return
    }

    const msg = new Message(false)
    this._entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.cid)
      } else {
        msg.addEntry(entry.cid, entry.priority)
      }
    })
    this._entries = []
    this.addMessage(msg)
  }

  /**
   * @param {Message} msg
   */
  async send (msg) {
    try {
      await this.network.connectTo(this.peerId)
    } catch (/** @type {any} */ err) {
      this._log.error('cant connect to peer %s: %s', this.peerId.toString(), err.message)
      return
    }

    this._log('sending message to peer %s', this.peerId.toString())

    // Note: Don't wait for sendMessage() to complete
    this.network.sendMessage(this.peerId, msg).catch((err) => {
      this._log.error('send error: %s', err.message)
    })
  }
}
