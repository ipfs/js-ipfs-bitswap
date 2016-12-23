/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const series = require('async/series')
const parallel = require('async/parallel')
const map = require('async/map')
const mapSeries = require('async/mapSeries')
const each = require('async/each')
const _ = require('lodash')
const Block = require('ipfs-block')
const pull = require('pull-stream')
const assert = require('assert')
const crypto = require('crypto')
const CID = require('cids')

const utils = require('../test/utils')

const nodes = [2, 5, 10, 20]
const blockFactors = [1, 10, 100]

console.log('-- start')
mapSeries(nodes, (n, cb) => {
  mapSeries(blockFactors, (blockFactor, cb) => {
    utils.genBitswapNetwork(n, (err, nodeArr) => {
      if (err) {
        return cb(err)
      }

      round(nodeArr, blockFactor, n, (err) => {
        if (err) {
          return cb(err)
        }

        shutdown(nodeArr, cb)
      })
    })
  }, cb)
}, (err) => {
  if (err) {
    throw err
  }
  console.log('-- finished')
})

function shutdown (nodeArr, cb) {
  each(nodeArr, (node, cb) => {
    node.bitswap.stop()
    node.libp2p.stop(cb)
  }, cb)
}

function round (nodeArr, blockFactor, n, cb) {
  const blocks = createBlocks(n, blockFactor)
  map(blocks, (b, cb) => b.key(cb), (err, keys) => {
    if (err) {
      return cb(err)
    }
    const cids = keys.map((k) => new CID(k))
    let d
    series([
      // put blockFactor amount of blocks per node
      (cb) => parallel(_.map(nodeArr, (node, i) => (callback) => {
        node.bitswap.start()

        const data = _.map(_.range(blockFactor), (j) => {
          const index = i * blockFactor + j
          return {
            block: blocks[index],
            cid: cids[index]
          }
        })
        each(
          data,
          (d, cb) => node.bitswap.put(d, cb),
          callback
        )
      }), cb),
      (cb) => {
        d = (new Date()).getTime()
        cb()
      },
      // fetch all blocks on every node
      (cb) => parallel(_.map(nodeArr, (node, i) => (callback) => {
        pull(
          node.bitswap.getStream(cids),
          pull.collect((err, res) => {
            if (err) {
              return callback(err)
            }

            assert(res.length === blocks.length)
            callback()
          })
        )
      }), cb)
    ], (err) => {
      if (err) {
        return cb(err)
      }
      console.log('  %s nodes - %s blocks/node - %sms', n, blockFactor, (new Date()).getTime() - d)
      cb()
    })
  })
}

function createBlocks (n, blockFactor) {
  return _.map(_.range(n * blockFactor), () => {
    return new Block(crypto.randomBytes(n * blockFactor))
  })
}
