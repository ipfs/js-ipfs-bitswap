/**
 * @template Key, Value
 * SortedMap is a Map whose iterator order can be defined by the user
 * @extends {Map<Key, Value>}
 */
export class SortedMap extends Map {
  /**
   * @param {Array<[Key, Value]>} [entries]
   * @param {(a:[Key, Value], b:[Key, Value]) => number} [cmp] - compares [k1, v1] to [k2, v2]
   */
  constructor (entries, cmp) {
    super()
    this._cmp = cmp || this._defaultSort
    /** @type {Key[]} */
    this._keys = []
    for (const [k, v] of entries || []) {
      this.set(k, v)
    }
  }

  /**
   * Call update to update the position of the key when it should change.
   * For example if the compare function sorts by the priority field, and the
   * priority changes, call update.
   * Call indexOf() to get the index _before_ the change happens.
   *
   * @param {number} i - the index of entry whose position should be updated.
   */
  update (i) {
    if (i < 0 || i >= this._keys.length) {
      return
    }

    const k = this._keys[i]
    this._keys.splice(i, 1)
    const newIdx = this._find(k)
    this._keys.splice(newIdx, 0, k)
  }

  /**
   * @param {Key} k
   * @param {Value} v
   */
  set (k, v) {
    // If the key is already in the map, remove it from the ordering and
    // re-insert it below
    if (this.has(k)) {
      const i = this.indexOf(k)
      this._keys.splice(i, 1)
    }

    // Update / insert the k/v into the map
    super.set(k, v)

    // Find the correct position of the newly inserted k/v in the order
    const i = this._find(k)
    this._keys.splice(i, 0, k)

    return this
  }

  clear () {
    super.clear()
    this._keys = []
  }

  /**
   * @param {Key} k
   */
  delete (k) {
    if (!this.has(k)) {
      return false
    }

    const i = this.indexOf(k)
    this._keys.splice(i, 1)
    return super.delete(k)
  }

  /**
   * @param {Key} k
   */
  indexOf (k) {
    if (!this.has(k)) {
      return -1
    }

    const i = this._find(k)
    if (this._keys[i] === k) {
      return i
    }

    // There may be more than one key with the same ordering
    // eg { k1: <priority 5>, k2: <priority 5> }
    // so scan outwards until the key matches
    for (let j = 1; j < this._keys.length; j++) {
      if (this._keys[i + j] === k) return i + j
      if (this._keys[i - j] === k) return i - j
    }

    return -1 // should never happen for existing key
  }

  /**
   * @private
   * @param {Key} k
   * @returns {number}
   */

  _find (k) {
    let lower = 0
    let upper = this._keys.length
    while (lower < upper) {
      const pivot = (lower + upper) >>> 1 // lower + (upper - lower) / 2
      const cmp = this._kCmp(this._keys[pivot], k)
      // console.log(`  _find ${lower}:${upper}[${pivot}] ${cmp}`)
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

    return undefined
  }

  /**
   * @returns {IterableIterator<Value>}
   */
  * values () {
    for (const k of this._keys) {
      // @ts-ignore - return of `this.get(k)` is `Value|undefined` which is
      // incompatible with `Value`. Typechecker can't that this contains values
      // for all the `_keys`. ts(2322)
      yield this.get(k)
    }

    return undefined
  }

  /**
   * @returns {IterableIterator<[Key, Value]>}
   */
  * entries () {
    for (const k of this._keys) {
      // @ts-ignore - return of `this.get(k)` is `Value|undefined` which is
      // incompatible with `Value`. Typechecker can't that this contains values
      // for all the `_keys`. ts(2322)
      yield [k, this.get(k)]
    }

    return undefined
  }

  * [Symbol.iterator] () {
    yield * this.entries()
  }

  /**
   * @template This
   * @param {(entry:[Key, Value]) => void} cb
   * @param {This} [thisArg]
   */
  // @ts-expect-error - Callback in Map forEach is (V, K, Map<K, V>) => void
  forEach (cb, thisArg) {
    if (!cb) {
      return
    }

    for (const k of this._keys) {
      cb.apply(thisArg, [[k, /** @type {Value} */(this.get(k))]])
    }
  }

  /**
   * @private
   * @param {[Key, Value]} a
   * @param {[Key, Value]} b
   * @returns {0|1|-1}
   */
  _defaultSort (a, b) {
    if (a[0] < b[0]) return -1
    if (b[0] < a[0]) return 1
    return 0
  }

  /**
   * @private
   * @param {Key} a
   * @param {Key} b
   */
  _kCmp (a, b) {
    return this._cmp(
      // @ts-ignore - get may return undefined
      [a, this.get(a)],
      // @ts-ignore - get may return undefined
      [b, this.get(b)]
    )
  }
}
