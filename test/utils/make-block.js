'use strict'

const multihashing = require('multihashing-async')
const CID = require('cids')
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer
const uuid = require('uuid/v4')

module.exports = async (count) => {
  const blocks = await Promise.all([...new Array(count || 1)].map(async () => {
    const data = Buffer.from(`hello world ${uuid()}`)
    const hash = await multihashing(data, 'sha2-256')
    return new Block(data, new CID(hash))
  }))

  return count ? blocks : blocks[0]
}
