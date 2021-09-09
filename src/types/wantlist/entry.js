
import { base58btc } from 'multiformats/bases/base58'

export class WantListEntry {
  /**
   * @param {import('multiformats').CID} cid
   * @param {number} priority
   * @param {import('../message/message').Message.Wantlist.WantType} wantType
   */
  constructor (cid, priority, wantType) {
    // Keep track of how many requests we have for this key
    this._refCounter = 1

    this.cid = cid
    this.priority = priority || 1
    this.wantType = wantType
  }

  inc () {
    this._refCounter += 1
  }

  dec () {
    this._refCounter = Math.max(0, this._refCounter - 1)
  }

  hasRefs () {
    return this._refCounter > 0
  }

  // So that console.log prints a nice description of this object
  get [Symbol.toStringTag] () {
    const cidStr = this.cid.toString(base58btc)
    return `WantlistEntry <key: ${cidStr}, priority: ${this.priority}, refs: ${this._refCounter}>`
  }

  /**
   * @param {any} other
   */
  equals (other) {
    return (this._refCounter === other._refCounter) &&
      this.cid.equals(other.cid) &&
      this.priority === other.priority &&
      this.wantType === other.wantType
  }
}
