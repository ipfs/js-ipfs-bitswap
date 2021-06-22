/* eslint max-nested-callbacks: ["error", 5] */
/* eslint-disable no-console */
'use strict'

const Benchmark = require('benchmark')
const assert = require('assert')
const all = require('it-all')
const drain = require('it-drain')
const makeBlock = require('../test/utils/make-blocks')
const genBitswapNetwork = require('../test/utils/mocks').genBitswapNetwork

const suite = new Benchmark.Suite('put-get')

const blockCounts = [1, 10, 1000]
const blockSizes = [10, 1024, 10 * 1024]

;(async function () {
  const [
    node
  ] = await genBitswapNetwork(1)

  const bitswap = node.bitswap

  blockCounts.forEach((n) => blockSizes.forEach((k) => {
    suite.add(`put-get ${n} blocks of size ${k}`, async (defer) => {
      const blocks = await makeBlock(n, k)

      await drain(bitswap.putMany(blocks))

      const res = await all(bitswap.getMany(blocks.map(block => block.cid)))

      assert(res.length === blocks.length)

      defer.resolve()
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
})()
