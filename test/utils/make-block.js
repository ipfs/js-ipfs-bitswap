'use strict'

const multihashing = require('multihashing-async')
const CID = require('cids')
const Block = require('ipld-block')
// @ts-ignore
const randomBytes = require('iso-random-stream/src/random')
// @ts-ignore
const range = require('lodash.range')
const uint8ArrayFromString = require('uint8arrays/from-string')
// @ts-ignore
const { v4: uuid } = require('uuid')

/**
 * @param {number} count
 * @param {number} [size]
 * @returns {Promise<Block[]|Block>}
 */
module.exports = async (count, size) => {
  const blocks = await Promise.all(
    range(count || 1).map(async () => {
      const data = size ? randomBytes(size) : uint8ArrayFromString(`hello world ${uuid()}`)
      const hash = await multihashing(data, 'sha2-256')
      return new Block(data, new CID(hash))
    })
  )

  return count ? blocks : blocks[0]
}
