'use strict'

const Wantlist = require('../types/wantlist')

/**
 * @typedef {import('cids')} CID
 */

class Ledger {
  /**
   * @param {import('peer-id')} peerId
   */
  constructor (peerId) {
    this.partner = peerId
    this.wantlist = new Wantlist()

    this.exchangeCount = 0
    this.sentToPeer = new Map()

    this.accounting = {
      bytesSent: 0,
      bytesRecv: 0
    }
  }

  /**
   * @param {number} n
   */
  sentBytes (n) {
    this.exchangeCount++
    this.lastExchange = (new Date()).getTime()
    this.accounting.bytesSent += n
  }

  /**
   * @param {number} n
   */
  receivedBytes (n) {
    this.exchangeCount++
    this.lastExchange = (new Date()).getTime()
    this.accounting.bytesRecv += n
  }

  /**
   *
   * @param {CID} cid
   * @param {number} priority
   * @param {import('../types/message/message').Message.Wantlist.WantType} wantType
   * @returns {void}
   */
  wants (cid, priority, wantType) {
    this.wantlist.add(cid, priority, wantType)
  }

  /**
   * @param {CID} cid
   * @returns {void}
   */

  cancelWant (cid) {
    this.wantlist.remove(cid)
  }

  /**
   * @param {CID} cid
   * @returns {import('../types/wantlist/entry')|void}
   */
  wantlistContains (cid) {
    return this.wantlist.contains(cid)
  }

  /**
   * @returns {number}
   */
  debtRatio () {
    return (this.accounting.bytesSent / (this.accounting.bytesRecv + 1)) // +1 is to prevent division by zero
  }
}

module.exports = Ledger
