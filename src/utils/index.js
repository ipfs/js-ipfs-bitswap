import debug from 'debug'
import { equals as uint8ArrayEquals } from 'uint8arrays/equals'
import { BitswapMessageEntry } from '../message/entry.js'

/**
 * Creates a logger for the given subsystem
 *
 * @param {import('@libp2p/interfaces/peer-id').PeerId} [id]
 * @param {string} [subsystem]
 */
export const logger = (id, subsystem) => {
  const name = ['bitswap']
  if (subsystem) {
    name.push(subsystem)
  }
  if (id) {
    name.push(`${id.toString().slice(0, 8)}`)
  }

  return Object.assign(debug(name.join(':')), {
    error: debug(name.concat(['error']).join(':'))
  })
}

/**
 * @template X, T
 * @param {(x:X, t:T) => boolean} pred
 * @param {X} x
 * @param {T[]} list
 * @returns {boolean}
 */
export const includesWith = (pred, x, list) => {
  let idx = 0
  const len = list.length
  while (idx < len) {
    if (pred(x, list[idx])) {
      return true
    }
    idx += 1
  }
  return false
}

/**
 * @template T
 * @param {(x:T, t:T) => boolean} pred
 * @param {T[]} list
 * @returns {T[]}
 */
export const uniqWith = (pred, list) => {
  let idx = 0
  const len = list.length
  const result = []
  let item

  while (idx < len) {
    item = list[idx]
    if (!includesWith(pred, item, result)) {
      result[result.length] = item
    }
    idx += 1
  }
  return result
}

/**
 * @template {string|number|symbol} K
 * @template V
 * @param {(v:V) => K} pred
 * @param {V[]} list
 * @returns {Record<K, V[]>}
 */
export const groupBy = (pred, list) => {
  return list.reduce((acc, v) => {
    const k = pred(v)

    if (acc[k]) {
      acc[k].push(v)
    } else {
      acc[k] = [v]
    }
    return acc
  }, /** @type {Record<K, V[]>} */({}))
}

/**
 * @template T, E
 * @param {(a:T, b:E) => boolean} pred
 * @param {T[]} list
 * @param {E[]} values
 * @returns {T[]}
 */
export const pullAllWith = (pred, list, values) => {
  return list.filter(i => {
    return !includesWith(pred, i, values)
  })
}

/**
 * @template T
 * @param {(v:T) => number} fn
 * @param {T[]} list
 * @returns {T[]}
 */
export const sortBy = (fn, list) => {
  return Array.prototype.slice.call(list, 0).sort((a, b) => {
    const aa = fn(a)
    const bb = fn(b)
    return aa < bb ? -1 : aa > bb ? 1 : 0
  })
}

/**
 * Is equal for Maps of BitswapMessageEntry or Uint8Arrays
 *
 * @param {Map<string, Uint8Array | BitswapMessageEntry>} a
 * @param {Map<string, Uint8Array | BitswapMessageEntry>} b
 */
export const isMapEqual = (a, b) => {
  if (a.size !== b.size) {
    return false
  }

  for (const [key, valueA] of a) {
    const valueB = b.get(key)

    if (valueB === undefined) {
      return false
    }

    // TODO: revisit this

    // Support Blocks
    if (valueA instanceof Uint8Array && valueB instanceof Uint8Array && !uint8ArrayEquals(valueA, valueB)) {
      return false
    }

    // Support BitswapMessageEntry
    if (valueA instanceof BitswapMessageEntry && valueB instanceof BitswapMessageEntry && !valueA.equals(valueB)) {
      return false
    }
  }

  return true
}
