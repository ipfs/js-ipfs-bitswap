'use strict'

const debug = require('debug')

/**
 * Creates a logger for the given subsystem
 *
 * @param {PeerId} [id]
 * @param {string} [subsystem]
 * @returns {debug}
 *
 * @private
 */
const logger = (id, subsystem) => {
  const name = ['bitswap']
  if (subsystem) {
    name.push(subsystem)
  }
  if (id) {
    name.push(`${id.toB58String().slice(0, 8)}`)
  }
  const logger = debug(name.join(':'))
  logger.error = debug(name.concat(['error']).join(':'))

  return logger
}

const includesWith = (pred, x, list) => {
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

const uniqWith = (pred, list) => {
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

const groupBy = (pred, list) => {
  return list.reduce((acc, v) => {
    const k = pred(v)

    if (acc[k]) {
      acc[k].push(v)
    } else {
      acc[k] = [v]
    }
    return acc
  }, {})
}

const pullAllWith = (pred, list, values) => {
  return list.filter(i => {
    return !includesWith(pred, i, values)
  })
}

const sortBy = (fn, list) => {
  return Array.prototype.slice.call(list, 0).sort((a, b) => {
    const aa = fn(a)
    const bb = fn(b)
    return aa < bb ? -1 : aa > bb ? 1 : 0
  })
}

/**
 * Is equal for Maps of BitswapMessageEntry or Blocks
 * @param {Map} a
 * @param {Map} b
 * @returns {boolean}
 */
const isMapEqual = (a, b) => {
  if (a.size !== b.size) {
    return false
  }

  for (const [key, valueA] of a) {
    if (!b.has(key)) {
      return false
    }

    const valueB = b.get(key)

    // Support BitswapMessageEntry
    if (typeof valueA.equals === 'function' && !valueA.equals(valueB)) {
      return false
    }
    // Support Blocks
    if (valueA._data && !valueA._data.equals(valueB._data)) {
      return false
    }
  }

  return true
}

module.exports = {
  logger,
  includesWith,
  uniqWith,
  groupBy,
  pullAllWith,
  sortBy,
  isMapEqual
}
