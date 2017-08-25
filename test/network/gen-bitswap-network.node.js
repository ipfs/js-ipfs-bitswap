/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const series = require('async/series')
const parallel = require('async/parallel')
const map = require('async/map')
const each = require('async/each')
const _ = require('lodash')
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer
const crypto = require('crypto')
const CID = require('cids')
const multihashing = require('multihashing-async')

const genBitswapNetwork = require('../utils/mocks').genBitswapNetwork

describe('gen Bitswap network', function () {
  // CI is very slow
  this.timeout(300 * 1000)

  it('retrieves local blocks', (done) => {
    genBitswapNetwork(1, (err, nodes) => {
      expect(err).to.not.exist()

      const node = nodes[0]
      let blocks

      series([
        (cb) => map(_.range(100), (k, cb) => {
          const b = Buffer.alloc(1024)
          b.fill(k)
          multihashing(b, 'sha2-256', (err, hash) => {
            expect(err).to.not.exist()
            const cid = new CID(hash)
            cb(null, new Block(b, cid))
          })
        }, (err, _blocks) => {
          expect(err).to.not.exist()
          blocks = _blocks
          cb()
        }),
        (cb) => each(
          blocks,
          (b, cb) => node.bitswap.put(b, cb),
          cb
        ),
        (cb) => map(_.range(100), (i, cb) => {
          node.bitswap.get(blocks[i].cid, cb)
        }, (err, res) => {
          expect(err).to.not.exist()
          expect(res).to.have.length(blocks.length)
          cb()
        })
      ], (err) => {
        expect(err).to.not.exist()
        node.bitswap.stop()
        node.libp2p.stop(done)
      })
    })
  })

  describe('distributed blocks', () => {
    it('with 2 nodes', (done) => {
      const n = 2
      genBitswapNetwork(n, (err, nodeArr) => {
        expect(err).to.not.exist()
        nodeArr.forEach((node) => {
          expect(
            Object.keys(node.libp2p.swarm.conns)
          ).to.be.empty()

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
  createBlocks(n, blockFactor, (err, blocks) => {
    if (err) {
      return cb(err)
    }
    const cids = blocks.map((b) => b.cid)
    let d
    series([
      // put blockFactor amount of blocks per node
      (cb) => parallel(_.map(nodeArr, (node, i) => (cb) => {
        node.bitswap.start()

        const data = _.map(_.range(blockFactor), (j) => {
          const index = i * blockFactor + j
          return blocks[index]
        })

        each(data, (d, cb) => node.bitswap.put(d, cb), cb)
      }), cb),
      (cb) => {
        d = (new Date()).getTime()
        // fetch all blocks on every node
        parallel(_.map(nodeArr, (node, i) => (cb) => {
          map(cids, (cid, cb) => {
            node.bitswap.get(cid, cb)
          }, (err, res) => {
            if (err) {
              return cb(err)
            }

            expect(res).to.have.length(blocks.length)
            cb()
          })
        }), cb)
      }
    ], (err) => {
      if (err) {
        return cb(err)
      }
      console.log('  time -- %s', (new Date()).getTime() - d)
      cb()
    })
  })
}

function createBlocks (n, blockFactor, callback) {
  map(_.map(_.range(n * blockFactor), (k) => {
    return crypto.randomBytes(n * blockFactor)
  }), (d, cb) => {
    multihashing(d, 'sha2-256', (err, hash) => {
      if (err) {
        return cb(err)
      }
      cb(null, new Block(d, new CID(hash)))
    })
  }, callback)
}
