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
const utils = require('../../utils')
const CID = require('cids')

describe.skip('gen Bitswap network', function () {
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
                  data: block.data,
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
        setTimeout(() => {
          node.bitswap.stop()
          node.libp2p.stop(done)
        })
      })
    })
  })

  // const counts = [2, 3, 4, 5, 10]
  const counts = [2]

  describe('distributed blocks', () => {
    counts.forEach((n) => {
      it(`with ${n} nodes`, (done) => {
        utils.genBitswapNetwork(n, (err, nodeArr) => {
          expect(err).to.not.exist
          nodeArr.forEach((node) => {
            expect(node.bitswap).to.exist
            expect(node.libp2p).to.exist
            expect(Object.keys(node.libp2p.swarm.conns).length).to.equal(0)
            expect(Object.keys(node.libp2p.swarm.muxedConns).length).to.equal(n - 1)
            expect(node.repo).to.exist
          })

          // -- actual test

          const round = (j, cb) => {
            const blockFactor = 10
            map(_.range(n * blockFactor), (k, cb) => {
              const b = Buffer.alloc(1024)
              b.fill(k)
              cb(null, new Block(b))
            }, (err, blocks) => {
              if (err) {
                return cb(err)
              }

              const d = (new Date()).getTime()

              parallel(_.map(nodeArr, (node, i) => (callback) => {
                node.bitswap.start()
                parallel([
                  (finish) => pull(
                    pull.values(
                      _.range(blockFactor)
                    ),
                    pull.map((j) => blocks[i * blockFactor + j]),
                    pull.asyncMap((b, cb) => {
                      b.key((err, key) => {
                        if (err) {
                          return cb(err)
                        }
                        cb(null, {
                          data: b.data,
                          key: new CID(key)
                        })
                      })
                    }),
                    node.bitswap.putStream(),
                    pull.onEnd(finish)
                  ),
                  (finish) => {
                    map(blocks, (b, cb) => b.key(cb), (err, keys) => {
                      expect(err).to.not.exist
                      const cids = keys.map((key) => new CID(key))
                      pull(
                        node.bitswap.getStream(cids),
                        pull.collect((err, res) => {
                          expect(err).to.not.exist
                          expect(res).to.have.length(blocks.length)
                          finish()
                        })
                      )
                    })
                  }
                ], callback)
              }), (err) => {
                expect(err).to.not.exist
                console.log('  time -- %s', (new Date()).getTime() - d)
                cb()
              })
            })
          }

          series(
            _.range(2).map((i) => (cb) => round(i, cb)),
            (err) => {
              // setTimeout is used to avoid closing the TCP socket while
              // spdy is still sending a ton of signalling data
              setTimeout(() => {
                parallel(nodeArr.map((node) => (cb) => {
                  node.bitswap.stop()
                  node.libp2p.stop(cb)
                }), (err2) => {
                  done(err || err2)
                })
              }, 3000)
            }
          )
        })
      })
    })
  })
})
