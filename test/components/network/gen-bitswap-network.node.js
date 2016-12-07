/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const series = require('async/series')
const parallel = require('async/parallel')
const map = require('async/map')
const each = require('async/each')
const _ = require('lodash')
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer
const pull = require('pull-stream')
const crypto = require('crypto')
const utils = require('../../utils')
const CID = require('cids')

describe('gen Bitswap network', function () {
  // CI is very slow
  this.timeout(300 * 1000)

  it('retrieves local blocks', (done) => {
    utils.genBitswapNetwork(1, (err, nodes) => {
      expect(err).to.not.exist

      const node = nodes[0]
      let blocks

      series([
        (cb) => map(_.range(100), (k, cb) => {
          const b = Buffer.alloc(1024)
          b.fill(k)
          cb(null, new Block(b))
        }, (err, _blocks) => {
          if (err) {
            return cb(err)
          }
          blocks = _blocks
          cb()
        }),
        (cb) => {
          pull(
            pull.values(blocks),
            pull.asyncMap((block, cb) => {
              block.key((err, key) => {
                if (err) {
                  return cb(err)
                }

                cb(null, {
                  block: block,
                  cid: new CID(key)
                })
              })
            }),
            node.bitswap.putStream(),
            pull.onEnd(cb)
          )
        },
        (cb) => {
          each(_.range(100), (i, cb) => {
            map(blocks, (block, cb) => block.key(cb), (err, keys) => {
              const cids = keys.map((key) => new CID(key))
              expect(err).to.not.exist
              pull(
                node.bitswap.getStream(cids),
                pull.collect((err, res) => {
                  expect(err).to.not.exist
                  expect(res).to.have.length(blocks.length)
                  cb()
                })
              )
            })
          }, cb)
        }
      ], (err) => {
        expect(err).to.not.exist
        node.bitswap.stop()
        node.libp2p.stop(done)
      })
    })
  })

  describe('distributed blocks', () => {
    it('with 2 nodes', (done) => {
      const n = 2
      utils.genBitswapNetwork(n, (err, nodeArr) => {
        expect(err).to.not.exist
        nodeArr.forEach((node) => {
          expect(
            Object.keys(node.libp2p.swarm.conns)
          ).to.be.empty

          expect(
            Object.keys(node.libp2p.swarm.muxedConns)
          ).to.have.length(n - 1)
        })

        // -- actual test
        round(nodeArr, n, (err) => {
          if (err) {
            return done(err)
          }

          each(nodeArr, (node, cb) => {
            node.bitswap.stop()
            node.libp2p.stop(cb)
          }, done)
        })
      })
    })
  })
})

function round (nodeArr, n, cb) {
  const blockFactor = 10
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

            expect(res).to.have.length(blocks.length)
            callback()
          })
        )
      }), cb)
    ], (err) => {
      if (err) {
        return cb(err)
      }
      console.log('  time -- %s', (new Date()).getTime() - d)
      cb()
    })
  })
}

function createBlocks (n, blockFactor) {
  return _.map(_.range(n * blockFactor), (k) => {
    return new Block(crypto.randomBytes(n * blockFactor))
  })
}
