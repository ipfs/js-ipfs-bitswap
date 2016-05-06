'use strict'

const Entry = require('./entry')

class Wantlist {
  constructor () {
    this.set = new Map()
  }

  get length () {
    return this.set.size
  }

  add (key, priority) {
    const e = this.set.get(key.toString('hex'))

    if (e) {
      e.inc()
      e.priority = priority
    } else {
      this.set.set(key.toString('hex'), new Entry(key, priority))
    }
  }

  remove (key) {
    const e = this.set.get(key.toString('hex'))

    if (!e) return

    e.dec()

    // only delete when no refs are held
    if (e.hasRefs()) return

    this.set.delete(key.toString('hex'))
  }

  entries () {
    return this.set.entries()
  }

  sortedEntries () {
    return new Map(Array.from(this.set.entries()).sort())
  }

  contains (key) {
    return this.set.get(key.toString('hex'))
  }
}

Wantlist.Entry = Entry
module.exports = Wantlist
