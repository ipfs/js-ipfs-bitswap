'use strict'

const { sortBy } = require('../../utils')
const Entry = require('./entry')

class Wantlist {
  constructor (stats) {
    this.set = new Map()
    this._stats = stats
  }

  get length () {
    return this.set.size
  }

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

  removeForce (cidStr) {
    if (this.set.has(cidStr)) {
      this.set.delete(cidStr)
    }
  }

  forEach (fn) {
    return this.set.forEach(fn)
  }

  entries () {
    return this.set.entries()
  }

  sortedEntries () {
    return new Map(sortBy(o => o[1].key, Array.from(this.set.entries())))
  }

  contains (cid) {
    const cidStr = cid.toString('base58btc')
    return this.set.get(cidStr)
  }
}

Wantlist.Entry = Entry
module.exports = Wantlist
