/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const utils = require('../utils')
const async = require('async')
const _ = require('lodash')
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer

describe('gen Bitswap network', function () {
  this.timeout(300 * 1000)

  it('retrieves local blocks', (done) => {
    utils.genBitswapNetwork(1, (err, nodes) => {
      expect(err).to.not.exist

      const node = nodes[0]
      const blocks = _.range(100).map((k) => {
        const b = Buffer.alloc(1024)
        b.fill(k)
        return new Block(b)
      })

      async.series([
        (cb) => {
          async.parallel(blocks.map((b) => (cb) => {
            node.bitswap.hasBlock(b, cb)
          }), cb)
        },
        (cb) => {
          async.each(_.range(100), (i, cb) => {
            async.parallel(blocks.map((b) => (cb) => {
              node.bitswap.getBlock(b.key, (err, res) => {
                expect(err).to.not.exist
                expect(res).to.be.eql(b)
                cb()
              })
            }), cb)
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
  const counts = [2, 3, 5]

  // TODO: Enable once we figured out why this is failing on CI
  describe.skip('distributed blocks', () => {
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
            const blocks = _.range(n * blockFactor).map((k) => {
              const buf = Buffer.alloc(1024)
              buf.fill(k)
              buf[0] = j
              return new Block(buf)
            })

            const d = (new Date()).getTime()

            async.parallel(_.map(nodeArr, (node, i) => (callback) => {
              node.bitswap.start()
              async.parallel([
                (finish) => {
                  async.parallel(_.range(blockFactor).map((j) => (cb) => {
                    // console.log('has node:%s block %s', i, i * blockFactor + j)
                    node.bitswap.hasBlock(blocks[i * blockFactor + j], cb)
                  }), finish)
                },
                (finish) => {
                  async.parallel(_.map(blocks, (b, j) => (cb) => {
                    node.bitswap.getBlock(b.key, (err, res) => {
                      // console.log('node:%s got block: %s', i, j)
                      expect(err).to.not.exist
                      expect(res).to.be.eql(b)
                      cb()
                    })
                  }), finish)
                }
              ], callback)
            }), (err) => {
              if (err) return cb(err)
              console.log('time -- %s', (new Date()).getTime() - d)
              cb()
            })
          }

          async.series(
            _.range(2).map((i) => (cb) => round(i, cb)),
            (err) => {
              // setTimeout is used to avoid closing the TCP socket while spdy is
              // still sending a ton of signalling data
              setTimeout(() => {
                async.parallel(nodeArr.map((node) => (cb) => {
                  node.bitswap.stop()
                  node.libp2p.stop(cb)
                }), (err2) => {
                  done(err || err2)
                })
              }, 2000)
            }
          )
        })
      })
    })
  })
})
