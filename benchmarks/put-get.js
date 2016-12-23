'use strict'

const Benchmark = require('benchmark')
const _ = require('lodash')
const Block = require('ipfs-block')
const assert = require('assert')
const pull = require('pull-stream')
const series = require('async/series')
const crypto = require('crypto')
const CID = require('cids')

const utils = require('../test/utils')

const suite = new Benchmark.Suite('put-get')

const blockCounts = [1, 10, 1000]
const blockSizes = [10, 1024, 10 * 1024]

utils.genBitswapNetwork(1, (err, nodes) => {
  if (err) {
    throw err
  }
  const node = nodes[0]
  const bitswap = node.bitswap

  blockCounts.forEach((n) => blockSizes.forEach((k) => {
    suite.add(`put-get ${n} blocks of size ${k}`, (defer) => {
      const blocks = createBlocks(n, k)
      series([
        (cb) => put(blocks, bitswap, cb),
        (cb) => get(blocks, bitswap, cb)
      ], (err) => {
        if (err) {
          throw err
        }
        defer.resolve()
      })
    }, {
      defer: true
    })
  }))

  suite
    .on('cycle', (event) => {
      console.log(String(event.target))
    })
    .on('complete', () => {
      process.exit()
    })
    .run({
      async: true
    })
})

function createBlocks (n, k) {
  return _.map(_.range(n), () => {
    return new Block(crypto.randomBytes(k))
  })
}

function put (blocks, bs, callback) {
  pull(
    pull.values(blocks),
    pull.asyncMap((b, cb) => {
      b.key((err, key) => {
        if (err) {
          return cb(err)
        }
        cb(null, {cid: new CID(key), block: b})
      })
    }),
    bs.putStream(),
    pull.onEnd(callback)
  )
}

function get (blocks, bs, callback) {
  pull(
    pull.values(blocks),
    pull.asyncMap((b, cb) => b.key(cb)),
    pull.map((k) => bs.getStream(new CID(k))),
    pull.flatten(),
    pull.collect((err, res) => {
      if (err) {
        return callback(err)
      }
      assert(res.length === blocks.length)
      callback()
    })
  )
}
