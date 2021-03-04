'use strict'

// @ts-ignore
const debounce = require('just-debounce-it')

const Message = require('../types/message')
const logger = require('../utils').logger
const { wantlistSendDebounceMs } = require('../constants')

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('cids')} CID
 * @typedef {import('../network')} Network
 */

module.exports = class MsgQueue {
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
    } catch (err) {
      this._log.error('cant connect to peer %s: %s', this.peerId.toB58String(), err.message)
      return
    }

    this._log('sending message to peer %s', this.peerId.toB58String())

    // Note: Don't wait for sendMessage() to complete
    this.network.sendMessage(this.peerId, msg).catch((err) => {
      this._log.error('send error: %s', err.message)
    })
  }
}
