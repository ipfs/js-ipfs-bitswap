'use strict'

const { sortBy } = require('../../utils')
const Entry = require('./entry')

/**
 * @typedef {import('cids')} CID
 */

class Wantlist {
  /**
   *
   * @param {import('../../stats')} [stats]
   */
  constructor (stats) {
    /** @type {Map<string, Entry>} */
    this.set = new Map()
    this._stats = stats
  }

  get length () {
    return this.set.size
  }

  /**
   * @param {CID} cid
   * @param {number} priority
   * @param {import('../message/message').Message.Wantlist.WantType} wantType
   */
  add (cid, priority, wantType) {
    // Have to import here to avoid circular reference
    const Message = require('../message')

    const cidStr = cid.toString('base58btc')
    const entry = this.set.get(cidStr)

    if (entry) {
      entry.inc()
      entry.priority = priority

      // We can only overwrite want-have with want-block
      if (entry.wantType === Message.WantType.Have && wantType === Message.WantType.Block) {
        entry.wantType = wantType
      }
    } else {
      this.set.set(cidStr, new Entry(cid, priority, wantType))
      if (this._stats) {
        this._stats.push(null, 'wantListSize', 1)
      }
    }
  }

  /**
   * @param {CID} cid
   */
  remove (cid) {
    const cidStr = cid.toString('base58btc')
    const entry = this.set.get(cidStr)

    if (!entry) {
      return
    }

    entry.dec()

    // only delete when no refs are held
    if (entry.hasRefs()) {
      return
    }

    this.set.delete(cidStr)
    if (this._stats) {
      this._stats.push(null, 'wantListSize', -1)
    }
  }

  /**
   * @param {string} cidStr
   */
  removeForce (cidStr) {
    if (this.set.has(cidStr)) {
      this.set.delete(cidStr)
    }
  }

  /**
   * @param {(entry:Entry, key:string) => void} fn
   */
  forEach (fn) {
    return this.set.forEach(fn)
  }

  entries () {
    return this.set.entries()
  }

  sortedEntries () {
    // TODO: Figure out if this is an actual bug.
    // @ts-expect-error - Property 'key' does not exist on type 'WantListEntry'
    return new Map(sortBy(o => o[1].key, Array.from(this.set.entries())))
  }

  /**
   * @param {CID} cid
   */
  contains (cid) {
    const cidStr = cid.toString('base58btc')
    return this.set.get(cidStr)
  }
}

Wantlist.Entry = Entry
module.exports = Wantlist
