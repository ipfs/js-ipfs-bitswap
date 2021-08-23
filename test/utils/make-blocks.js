'use strict'

const { CID } = require('multiformats')
const { sha256 } = require('multiformats/hashes/sha2')
// @ts-ignore
const randomBytes = require('iso-random-stream/src/random')
// @ts-ignore
const range = require('lodash.range')
const { fromString: uint8ArrayFromString } = require('uint8arrays/from-string')
// @ts-ignore
const { v4: uuid } = require('uuid')

/**
 * @param {number} count
 * @param {number} [size]
 * @returns {Promise<{ cid: CID, data: Uint8Array}[]>}
 */
module.exports = async (count, size) => {
  const blocks = await Promise.all(
    range(count || 1).map(async () => {
      const data = size ? randomBytes(size) : uint8ArrayFromString(`hello world ${uuid()}`)
      const hash = await sha256.digest(data)
      return {
        cid: CID.createV0(hash),
        data
      }
    })
  )

  return blocks
}
