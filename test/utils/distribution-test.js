'use strict'

const range = require('lodash.range')
const map = require('async/map')
const each = require('async/each')
const whilst = require('async/whilst')
const series = require('async/series')
const waterfall = require('async/waterfall')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const EventEmitter = require('events')

const createBitswap = require('./create-bitswap')
const makeBlock = require('./make-block')
const connectAll = require('./connect-all')

module.exports = (instanceCount, blockCount, repeats, callback) => {
  let pendingRepeats = repeats
  let nodes
  const events = new EventEmitter()

  waterfall([
    (cb) => map(range(instanceCount), (_, cb) => createBitswap(cb), cb),
    (_nodes, cb) => {
      nodes = _nodes
      events.emit('start')
      cb()
    },
    (cb) => {
      connectAll(nodes, cb)
    },
    (cb) => {
      events.emit('all connected')
      whilst(() => pendingRepeats > 0, (cb) => {
        const first = nodes[0]
        let blocks
        waterfall([
          (cb) => map(range(blockCount), (_, cb) => makeBlock(cb), cb),
          (_blocks, cb) => {
            blocks = _blocks
            cb()
          },
          (cb) => each(blocks, first.bitswap.put.bind(first.bitswap), (err) => {
            events.emit('first put')
            cb(err)
          }),
          (cb) => map(nodes, (node, cb) => {
            events.emit('getting many')
            const cids = blocks.map((block) => block.cid)
            const start = Date.now()
            node.bitswap.getMany(cids, (err, result) => {
              if (err) {
                cb(err)
              } else {
                const elapsed = Date.now() - start
                events.emit('got block', elapsed)
                cb(null, result)
              }
            })
          }, cb),
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
          },
          (cb) => {
            pendingRepeats--
            cb()
          }
        ], cb)
      }, cb)
    }
  ],
  (err) => {
    events.emit('stop')
    each(
      nodes,
      (node, cb) => {
        series(
          [
            (cb) => node.bitswap.stop(cb),
            (cb) => node.libp2pNode.stop(cb),
            (cb) => node.repo.teardown(cb)
          ],
          cb)
      },
      (err2) => {
        events.emit('stopped')
        callback(err)
      }
    )
  })

  return events
}
