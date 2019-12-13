'use strict'

/**
 * SortedMap is a Map whose iterator order can be defined by the user
 */
class SortedMap extends Map {
  /**
   * @param {Array<k, v>} [entries]
   * @param {function(a, b)} [cmp]
   */
  constructor (entries, cmp) {
    super(entries)
    this._cmp = cmp
    this._keys = []
  }

  // Performance is O(N log(N)).
  // Could be O(log(N)) if we use a sorted array. Fix this if performance isn't
  // good enough.
  set (k, data) {
    super.set(k, data)
    const i = this._keys.indexOf(k)
    if (i < 0) {
      this._keys.push(k)
      this._keys.sort(this._kvCmp.bind(this))
    }
  }

  clear () {
    super.clear()
    this._keys = []
  }

  /**
   * Call update to manually trigger a sort.
   * For example if the compare function sorts by the priority field, and the
   * priority changes, call update.
   *
   * @param {Object} [k] the key corresponding to the entry whose position
   * should be updated.
   */
  update (k) {
    this._keys.sort(this._kvCmp.bind(this))
  }

  // Same performance comments as set()
  delete (k) {
    const i = this._keys.indexOf(k)
    if (i >= 0) {
      this._keys.splice(i, 1)
      super.delete(k)
    }
  }

  * keys () {
    for (const k of this._keys) {
      yield k
    }
  }

  * values () {
    for (const k of this._keys) {
      yield this.get(k)
    }
  }

  * entries () {
    for (const k of this._keys) {
      yield [k, this.get(k)]
    }
  }

  * [Symbol.iterator] () {
    yield * this.entries()
  }

  forEach (cb, thisArg) {
    if (!cb) {
      return
    }

    for (const k of this._keys) {
      cb.apply(thisArg, [[k, this.get(k)]])
    }
  }

  _kvCmp (a, b) {
    // By default sort by built-in compare
    if (!this._cmp) {
      if (a < b) return -1
      if (b < a) return 1
      return 0
    }

    return this._cmp(
      [a, this.get(a)],
      [b, this.get(b)]
    )
  }
}

module.exports = SortedMap
