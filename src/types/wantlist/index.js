'use strict'

const sort = require('lodash.sortby')
const Entry = require('./entry')

class Wantlist {
  constructor () {
    this.set = new Map()
  }

  get length () {
    return this.set.size
  }

  add (cid, priority) {
    const cidStr = cid.buffer.toString()
    const entry = this.set.get(cidStr)

    if (entry) {
      entry.inc()
      entry.priority = priority
    } else {
      this.set.set(cidStr, new Entry(cid, priority))
    }
  }

  remove (cid) {
    const cidStr = cid.buffer.toString()
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
    return new Map(
      sort(Array.from(this.set.entries()), (o) => {
        return o[1].key
      })
    )
  }

  contains (cid) {
    const cidStr = cid.buffer.toString()
    return this.set.get(cidStr)
  }
}

Wantlist.Entry = Entry
module.exports = Wantlist
