import { Wantlist } from '../wantlist/index.js'

/**
 * @typedef {import('multiformats').CID} CID
 */

export class Ledger {
  /**
   * @param {import('@libp2p/interface-peer-id').PeerId} peerId
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
   * @param {import('../message/message').Message.Wantlist.WantType} wantType
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
   */
  wantlistContains (cid) {
    return this.wantlist.get(cid)
  }

  /**
   * @returns {number}
   */
  debtRatio () {
    return (this.accounting.bytesSent / (this.accounting.bytesRecv + 1)) // +1 is to prevent division by zero
  }
}
