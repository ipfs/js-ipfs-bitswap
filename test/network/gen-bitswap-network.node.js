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
const utils = require('../utils')

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
            pull.asyncMap((b, cb) => {
              b.key((err, key) => {
                if (err) {
                  return cb(err)
                }

                cb(null, {data: b.data, key: key})
              })
            }),
            node.bitswap.putStream(),
            pull.onEnd(cb)
          )
        },
        (cb) => {
          each(_.range(100), (i, cb) => {
            map(blocks, (b, cb) => b.key(cb), (err, keys) => {
              expect(err).to.not.exist
              pull(
                node.bitswap.getStream(keys),
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
        setTimeout(() => {
          node.bitswap.stop()
          node.libp2p.stop(done)
        })
      })
    })
  })

  // const counts = [2, 3, 4, 5, 10]
  const counts = [2, 5]//, 10]

  describe('distributed blocks', () => counts.forEach((n) => {
    it(`with ${n} nodes`, (done) => {
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
          // setTimeout is used to avoid closing the TCP socket while spdy is
          // still sending a ton of signalling data
          if (err) {
            console.log(err)
          }
          setTimeout(() => {
            series(nodeArr.map((node) => (cb) => {
              node.bitswap.stop()
              node.libp2p.stop(cb)
            }), (err) => {
              if (err) {
                console.log(err)
              }
              done()
            })
          }, 3000)
        })
      })
    })
  }))
})

function round (nodeArr, n, cb) {
  const blockFactor = 10
  const blocks = createBlocks(n, blockFactor)
  map(blocks, (b, cb) => b.key(cb), (err, keys) => {
    if (err) {
      return cb(err)
    }
    let d
    series([
      // put blockFactor amount of blocks per node
      (cb) => parallel(_.map(nodeArr, (node, i) => (callback) => {
        node.bitswap.start()

        const data = _.map(_.range(blockFactor), (j) => {
          const index = i * blockFactor + j
          return {
            data: blocks[index].data,
            key: keys[index]
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
          node.bitswap.getStream(keys),
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
    const b = Buffer.alloc(1024)
    b.fill(k * Math.ceil(Math.random() * 5))
    return new Block(b)
  })
}
