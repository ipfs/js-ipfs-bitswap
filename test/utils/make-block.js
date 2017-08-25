'use strict'

const multihashing = require('multihashing-async')
const CID = require('cids')
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer

module.exports = (callback) => {
  const data = Buffer.from(`hello world ${Math.random()}`)

  multihashing(data, 'sha2-256', (err, hash) => {
    if (err) { return callback(err) }
    callback(null, new Block(data, new CID(hash)))
  })
}
