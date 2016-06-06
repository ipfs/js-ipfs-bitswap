'use strict'

const mh = require('multihashes')

const Entry = require('./entry')

class Wantlist {
  constructor () {
    this.set = new Map()
  }

  get length () {
    return this.set.size
  }

  add (key, priority) {
    const e = this.set.get(mh.toB58String(key))

    if (e) {
      e.inc()
      e.priority = priority
    } else {
      this.set.set(mh.toB58String(key), new Entry(key, priority))
    }
  }

  remove (key) {
    const e = this.set.get(mh.toB58String(key))

    if (!e) return

    e.dec()

    // only delete when no refs are held
    if (e.hasRefs()) return

    this.set.delete(mh.toB58String(key))
  }

  removeForce (key) {
    if (this.set.has(key)) {
      this.set.delete(key)
    }
  }

  entries () {
    return this.set.entries()
  }

  sortedEntries () {
    return new Map(Array.from(this.set.entries()).sort())
  }

  contains (key) {
    return this.set.get(mh.toB58String(key))
  }
}

Wantlist.Entry = Entry
module.exports = Wantlist
