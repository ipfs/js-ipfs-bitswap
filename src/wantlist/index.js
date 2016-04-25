'use strict'

const Entry = require('./entry')

module.exports = class Wantlist {
  constructor () {
    this.set = new Map()
  }

  get length () {
    return this.set.size
  }

  add (key, priority) {
    const e = this.set.get(key)

    if (e) {
      e.inc()
      e.priority = priority
    } else {
      this.set.set(key, new Entry(key, priority))
    }
  }

  remove (key) {
    const e = this.set.get(key)

    if (!e) return

    e.dec()

    // only delete when no refs are held
    if (e.hasRefs()) return

    this.set.delete(key)
  }

  entries () {
    return this.set.entries()
  }

  contains (key) {
    return this.set.has(key)
  }
}
