'use strict'

const multihashing = require('multihashing-async')
const CID = require('cids')
const Block = require('ipld-block')
const crypto = require('crypto')
const range = require('lodash.range')
const { Buffer } = require('buffer')
const uuid = require('uuid/v4')

module.exports = async (count, size) => {
  const blocks = await Promise.all(
    range(count || 1).map(async () => {
      const data = size ? crypto.randomBytes(size) : Buffer.from(`hello world ${uuid()}`)
      const hash = await multihashing(data, 'sha2-256')
      return new Block(data, new CID(hash))
    })
  )

  return count ? blocks : blocks[0]
}
