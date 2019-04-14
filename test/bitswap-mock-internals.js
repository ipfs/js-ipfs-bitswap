/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const eachSeries = require('async/eachSeries')
const map = require('async/map')
const parallel = require('async/parallel')
const setImmediate = require('async/setImmediate')
const _ = require('lodash')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const promisify = require('promisify-es6')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const mockNetwork = require('./utils/mocks').mockNetwork
const applyNetwork = require('./utils/mocks').applyNetwork
const mockLibp2pNode = require('./utils/mocks').mockLibp2pNode
const storeHasBlocks = require('./utils/store-has-blocks')
const makeBlock = require('./utils/make-block')
const orderedFinish = require('./utils/helpers').orderedFinish

describe('bitswap with mocks', function () {
  this.timeout(10 * 1000)

  let repo
  let blocks
  let ids

  before((done) => {
    parallel([
      (cb) => createTempRepo(cb),
      (cb) => map(_.range(15), (i, cb) => makeBlock(cb), cb),
      (cb) => map(_.range(2), (i, cb) => PeerId.create({ bits: 512 }, cb), cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }

      repo = results[0]
      blocks = results[1]
      ids = results[2]

      done()
    })
  })

  after((done) => {
    repo.teardown(done)
  })

  describe('receive message', () => {
    it('simple block message', (done) => {
      (async () => {
        const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
        await bs.start().catch((err) => {
          expect(err).to.not.exist()
        })

        const other = ids[1]

        const b1 = blocks[0]
        const b2 = blocks[1]

        bs.wm.wantBlocks([b1.cid, b2.cid])

        const msg = new Message(false)
        msg.addBlock(b1)
        msg.addBlock(b2)

        bs._receiveMessage(other, msg, (err) => {
          expect(err).to.not.exist()

          map([b1.cid, b2.cid], (cid, cb) => repo.blocks.get(cid, cb), (err, blocks) => {
            expect(err).to.not.exist()

            expect(blocks[0].data).to.eql(b1.data)
            expect(blocks[1].data).to.eql(b2.data)

            const ledger = bs.ledgerForPeer(other)
            expect(ledger.peer).to.equal(other.toPrint())
            expect(ledger.value).to.equal(0)
            expect(ledger.sent).to.equal(0)
            expect(ledger.recv).to.equal(96)
            expect(ledger.exchanged).to.equal(2)
            done()
          })
        })
      })()
    })

    it('simple want message', (done) => {
      (async () => {
        const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
        await bs.start().catch((err) => {
          expect(err).to.not.exist()
        })

        const other = ids[1]
        const b1 = blocks[0]
        const b2 = blocks[1]

        const msg = new Message(false)

        msg.addEntry(b1.cid, 1, false)
        msg.addEntry(b2.cid, 1, false)

        bs._receiveMessage(other, msg, (err) => {
          expect(err).to.not.exist()

          const wl = bs.wantlistForPeer(other)

          expect(wl.has(b1.cid.toString('base58btc'))).to.eql(true)
          expect(wl.has(b2.cid.toString('base58btc'))).to.eql(true)

          done()
        })
      })()
    })

    it('multi peer', function (done) {
      this.timeout(80 * 1000)
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      let others
      let blocks

      (async () => {
        await bs.start()

        parallel([
          (cb) => map(_.range(5), (i, cb) => PeerId.create({ bits: 512 }, cb), cb),
          (cb) => map(_.range(10), (i, cb) => makeBlock(cb), cb)
        ], (err, results) => {
          expect(err).to.not.exist()

          others = results[0]
          blocks = results[1]
          test()
        })

        function test () {
          map(_.range(5), (i, cb) => {
            const msg = new Message(false)
            msg.addBlock(blocks[i])
            msg.addBlock(blocks[i + 5])
            cb(null, msg)
          }, (err, messages) => {
            expect(err).to.not.exist()
            let i = 0
            eachSeries(others, (other, cb) => {
              const msg = messages[i]
              i++

              const cids = [...msg.blocks.values()].map(b => b.cid)
              bs.wm.wantBlocks(cids)

              bs._receiveMessage(other, msg, (err) => {
                expect(err).to.not.exist()
                storeHasBlocks(msg, repo.blocks, cb)
              })
            }, done)
          })
        }
      })()
    })

    it('ignore unwanted blocks', (done) => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      bs.start((err) => {
        expect(err).to.not.exist()

        const other = ids[1]

        const b1 = blocks[2]
        const b2 = blocks[3]
        const b3 = blocks[4]

        bs.wm.wantBlocks([b2.cid])

        const msg = new Message(false)
        msg.addBlock(b1)
        msg.addBlock(b2)
        msg.addBlock(b3)

        bs._receiveMessage(other, msg, (err) => {
          expect(err).to.not.exist()

          map([b1.cid, b2.cid, b3.cid], (cid, cb) => repo.blocks.has(cid, cb), (err, res) => {
            expect(err).to.not.exist()

            expect(res).to.eql([false, true, false])

            const ledger = bs.ledgerForPeer(other)
            expect(ledger.peer).to.equal(other.toPrint())
            expect(ledger.value).to.equal(0)

            // Note: Keeping track of received bytes for blocks affects the
            // debt ratio, which in future may be used as part of fairness
            // algorithms when prioritizing who to send blocks to.
            // So we may want to revise whether we record received blocks from
            // a peer even if we didn't ask for the blocks.
            // For now keeping it liks this to match the go implementation:
            // https://github.com/ipfs/go-bitswap/blob/acc22c283722c15436120ae522c8e8021d0b06f8/bitswap.go#L293
            expect(ledger.sent).to.equal(0)
            expect(ledger.recv).to.equal(144)
            expect(ledger.exchanged).to.equal(3)
            done()
          })
        })
      })
    })
  })

  describe('get', () => {
    it('fails on requesting empty block', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      try {
        await bs.get(null)
      } catch (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('Not a valid cid')
      }
    })

    it('block exists locally', async () => {
      const block = blocks[4]
      await promisify(repo.blocks.put)(block)
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const retrievedBlock = await bs.get(block.cid)
      expect(retrievedBlock).to.eql(block)
    })

    it('blocks exist locally', async () => {
      const b1 = blocks[3]
      const b2 = blocks[14]
      const b3 = blocks[13]

      await promisify(repo.blocks.putMany)([b1, b2, b3])
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const gen = bs.getMany([b1.cid, b2.cid, b3.cid])
      const retrievedBlocks = []
      for await (const block of gen) {
        retrievedBlocks.push(block)
      }
      expect(retrievedBlocks).to.be.eql([b1, b2, b3])
    })

    it('getMany', async () => {
      const b1 = blocks[5]
      const b2 = blocks[6]
      const b3 = blocks[7]

      await promisify(repo.blocks.putMany)([b1, b2, b3])
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const block1 = await bs.get(b1.cid)
      expect(block1).to.eql(b1)

      const block2 = await bs.get(b2.cid)
      expect(block2).to.eql(b2)

      const block3 = await bs.get(b3.cid)
      expect(block3).to.eql(b3)
    })

    it('block is added locally afterwards', (done) => {
      (async () => {
        const finish = orderedFinish(2, done)
        const block = blocks[9]
        const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
        const net = mockNetwork()

        bs.network = net
        bs.wm.network = net
        bs.engine.network = net
        await bs.start()
        bs.get(block.cid).then((res) => {
          expect(res).to.eql(block)
          finish(2)
        })

        setTimeout(() => {
          finish(1)
          bs.put(block, () => {})
        }, 200)
      })()
    })

    it('block is sent after local add', (done) => {
      const me = ids[0]
      const other = ids[1]
      const block = blocks[10]
      let bs1
      let bs2

      const n1 = {
        connectTo (id, cb) {
          let err
          if (id.toHexString() !== other.toHexString()) {
            err = new Error('unknown peer')
          }
          setImmediate(() => cb(err))
        },
        sendMessage (id, msg, cb) {
          if (id.toHexString() === other.toHexString()) {
            bs2._receiveMessage(me, msg, cb)
          } else {
            setImmediate(() => cb(new Error('unkown peer')))
          }
        },
        start (callback) {
          setImmediate(() => callback())
        },
        stop (callback) {
          setImmediate(() => callback())
        },
        findAndConnect (cid, callback) {
          setImmediate(() => callback())
        },
        provide (cid, callback) {
          setImmediate(() => callback())
        }
      }
      const n2 = {
        connectTo (id, cb) {
          let err
          if (id.toHexString() !== me.toHexString()) {
            err = new Error('unkown peer')
          }
          setImmediate(() => cb(err))
        },
        sendMessage (id, msg, cb) {
          if (id.toHexString() === me.toHexString()) {
            bs1._receiveMessage(other, msg, cb)
          } else {
            setImmediate(() => cb(new Error('unkown peer')))
          }
        },
        start (callback) {
          setImmediate(() => callback())
        },
        stop (callback) {
          setImmediate(() => callback())
        },
        findAndConnect (cid, callback) {
          setImmediate(() => callback())
        },
        provide (cid, callback) {
          setImmediate(() => callback())
        }
      }

      // Do not remove semi-colon. Will break the test.
      ;(async () => {
        // Create and start bs1
        bs1 = new Bitswap(mockLibp2pNode(), repo.blocks)
        applyNetwork(bs1, n1)
        await bs1.start()

        // Create and start bs2
        const repo2 = await promisify(createTempRepo)()
        bs2 = new Bitswap(mockLibp2pNode(), repo2.blocks)
        applyNetwork(bs2, n2)
        await bs2.start()

        bs1._onPeerConnected(other)
        bs2._onPeerConnected(me)

        bs1.get(block.cid).then((res) => {
          expect(res).to.eql(block)
          done()
        }).catch((err) => {
          expect(err).to.not.exist()
        })
        setTimeout(() => {
          bs2.put(block, () => {})
        }, 1000)
      })()
    })

    it('double get', (done) => {
      const block = blocks[11]

      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      Promise.all([
        bs.get(block.cid),
        bs.get(block.cid)
      ]).then((res) => {
        expect(res[0]).to.eql(block)
        expect(res[1]).to.eql(block)
        done()
      }).catch((err) => {
        expect(err).to.not.exist()
      })

      bs.put(block, (err) => {
        expect(err).to.not.exist()
      })
    })
  })

  describe('unwant', () => {
    it('removes blocks that are wanted multiple times', (done) => {
      (async () => {
        const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
        await bs.start()

        const b = blocks[12]
        Promise.all([
          bs.get(b.cid),
          bs.get(b.cid)
        ]).then((res) => {
          expect(res[1]).to.not.exist()
          done()
        }).catch((e) => {
          expect(e).to.not.exist()
        })

        setTimeout(() => bs.unwant(b.cid), 10)
      })()
    })
  })

  describe('ledgerForPeer', () => {
    it('returns null for unknown peer', (done) => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      PeerId.create({ bits: 512 }, (err, id) => {
        expect(err).to.not.exist()
        const ledger = bs.ledgerForPeer(id)
        expect(ledger).to.equal(null)
        done()
      })
    })
  })
})
