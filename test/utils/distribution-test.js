'use strict'

const range = require('lodash.range')
const map = require('async/map')
const each = require('async/each')
const parallel = require('async/parallel')
const series = require('async/series')
const waterfall = require('async/waterfall')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const createBitswap = require('./create-bitswap')
const makeBlock = require('./make-block')
const connectAll = require('./connect-all')

module.exports = (instanceCount, blockCount, callback) => {
  let nodes
  let blocks

  waterfall([
    (cb) => parallel(
      {
        nodes: (cb) => map(range(instanceCount), (_, cb) => createBitswap(cb), cb),
        blocks: (cb) => map(range(blockCount), (_, cb) => makeBlock(cb), cb)
      },
      cb),
    (results, cb) => {
      nodes = results.nodes
      blocks = results.blocks
      const first = nodes[0]

      parallel([
        (cb) => connectAll(results.nodes, cb),
        (cb) => each(results.blocks, first.bitswap.put.bind(first.bitswap), cb)
      ], cb)
    },
    (results, cb) => {
      const cids = blocks.map((block) => block.cid)
      map(nodes, (node, cb) => node.bitswap.getMany(cids, cb), cb)
    },
    (results, cb) => {
      try {
        expect(results).have.lengthOf(instanceCount)
        results.forEach((nodeBlocks) => {
          expect(nodeBlocks).to.have.lengthOf(blocks.length)
          nodeBlocks.forEach((block, i) => {
            expect(block.data).to.deep.equal(blocks[i].data)
          })
        })
      } catch (err) {
        return cb(err)
      }
      cb()
    }
  ],
  (err) => {
    each(
      nodes,
      (node, cb) => {
        series(
          [
            (cb) => node.bitswap.stop(cb),
            (cb) => node.libp2pNode.stop(cb),
            (cb) => node.repo.teardown(cb)
          ],
          cb
        )
      },
      (err2) => {
        callback(err)
      }
    )
  })
}
