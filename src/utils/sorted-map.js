'use strict'

/**
 * SortedMap is a Map whose iterator order can be defined by the user
 */
class SortedMap extends Map {
  /**
   * @param {Array<k, v>} [entries]
   * @param {function(a, b)} [cmp] compares [k1, v1] to [k2, v2]
   */
  constructor (entries, cmp) {
    super()
    this._cmp = cmp || this._defaultSort
    this._keys = []
    for (const [k, v] of entries || []) {
      this.set(k, v)
    }
  }

  /**
   * Call update to update the position of the key when it should change.
   * For example if the compare function sorts by the priority field, and the
   * priority changes, call update.
   *
   * @param {Object} [k] the key corresponding to the entry whose position
   * should be updated.
   */
  update (k) {
    if (this.has(k)) {
      this.set(k, this.get(k))
    }
  }

  set (k, v) {
    // If the key is already in the map, remove it from the ordering and
    // re-insert it below
    if (this.has(k)) {
      const i = this._find(k)
      this._keys.splice(i, 1)
    }

    // Update / insert the k/v into the map
    super.set(k, v)

    // Find the correct position of the newly inserted k/v in the order
    const i = this._find(k)
    this._keys.splice(i, 0, k)
  }

  clear () {
    super.clear()
    this._keys = []
  }

  delete (k) {
    if (!this.has(k)) {
      return
    }
    const i = this._find(k)
    this._keys.splice(i, 1)
    super.delete(k)
  }

  _find (k) {
    let lower = 0
    let upper = this._keys.length
    while (lower < upper) {
      const pivot = (lower + upper) >>> 1 // lower + (upper - lower) / 2
      const cmp = this._kCmp(this._keys[pivot], k)
      if (cmp < 0) { // pivot < k
        lower = pivot + 1
      } else if (cmp > 0) { // pivot > k
        upper = pivot
      } else { // pivot == k
        return pivot
      }
    }
    return lower
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

  _defaultSort (a, b) {
    if (a[0] < b[0]) return -1
    if (b[0] < a[0]) return 1
    return 0
  }

  _kCmp (a, b) {
    return this._cmp(
      [a, this.get(a)],
      [b, this.get(b)]
    )
  }
}

module.exports = SortedMap
