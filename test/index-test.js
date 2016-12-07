/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const eachSeries = require('async/eachSeries')
const waterfall = require('async/waterfall')
const each = require('async/each')
const map = require('async/map')
const parallel = require('async/parallel')
const setImmediate = require('async/setImmediate')
const _ = require('lodash')
const expect = require('chai').expect
const PeerId = require('peer-id')
const Block = require('ipfs-block')
const PeerBook = require('peer-book')
const pull = require('pull-stream')
const CID = require('cids')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const utils = require('./utils')

const makeBlock = (cb) => cb(null, new Block(`hello world ${Math.random()}`))

module.exports = (repo) => {
  const libp2pMock = {
    handle: function () {},
    swarm: {
      muxedConns: {},
      on () {},
      setMaxListeners () {}
    }
  }

  describe('bitswap', () => {
    let store
    let blocks
    let cids
    let ids

    before((done) => {
      parallel([
        (cb) => repo.create('hello', cb),
        (cb) => map(_.range(12), (i, cb) => makeBlock(cb), cb),
        (cb) => map(_.range(2), (i, cb) => PeerId.create(cb), cb)
      ], (err, results) => {
        if (err) {
          return done(err)
        }

        store = results[0].blockstore
        blocks = results[1]
        ids = results[2]

        map(blocks, (b, cb) => b.key(cb), (err, keys) => {
          if (err) {
            return done(err)
          }
          cids = keys.map((key) => new CID(key))
          done()
        })
      })
    })

    after((done) => {
      repo.remove(done)
    })

    describe('receive message', () => {
      it('simple block message', (done) => {
        const book = new PeerBook()
        const bs = new Bitswap(libp2pMock, store, book)
        bs.start()

        const other = ids[1]

        const b1 = blocks[0]
        const b2 = blocks[1]
        const cid1 = cids[0]
        const cid2 = cids[1]

        const msg = new Message(false)
        msg.addBlock(cid1, b1)
        msg.addBlock(cid2, b2)

        bs._receiveMessage(other, msg, (err) => {
          if (err) {
            throw err
          }

          expect(bs.blocksRecvd).to.equal(2)
          expect(bs.dupBlocksRecvd).to.equal(0)

          pull(
            pull.values([cid1, cid2]),
            pull.map((cid) => store.getStream(cid.multihash)),
            pull.flatten(),
            pull.collect((err, blocks) => {
              if (err) {
                return done(err)
              }

              expect(blocks[0].data).to.eql(b1.data)
              expect(blocks[1].data).to.eql(b2.data)
              done()
            })
          )
        })
      })

      it('simple want message', (done) => {
        const book = new PeerBook()
        const bs = new Bitswap(libp2pMock, store, book)
        bs.start()

        const other = ids[1]
        const cid1 = cids[0]
        const cid2 = cids[1]

        const msg = new Message(false)

        msg.addEntry(cid1, 1, false)
        msg.addEntry(cid2, 1, false)

        bs._receiveMessage(other, msg, (err) => {
          expect(err).to.not.exist

          expect(bs.blocksRecvd).to.be.eql(0)
          expect(bs.dupBlocksRecvd).to.be.eql(0)

          const wl = bs.wantlistForPeer(other)

          expect(wl.has(cid1.buffer.toString())).to.eql(true)
          expect(wl.has(cid2.buffer.toString())).to.eql(true)

          done()
        })
      })

      it('multi peer', (done) => {
        const book = new PeerBook()
        const bs = new Bitswap(libp2pMock, store, book)

        let others
        let blocks
        let cids

        bs.start()

        parallel([
          (cb) => map(_.range(5), (i, cb) => PeerId.create(cb), cb),
          (cb) => cb(null, _.range(10).map((i) => new Block(`hello ${i}`)))
        ], (err, results) => {
          if (err) {
            return done(err)
          }

          others = results[0]
          blocks = results[1]

          map(blocks, (b, cb) => b.key(cb), (err, keys) => {
            if (err) {
              return done(err)
            }
            cids = keys.map((key) => new CID(key))
            test()
          })
        })

        function test () {
          map(_.range(5), (i, cb) => {
            const msg = new Message(false)

            each([
              { block: blocks[i], cid: cids[i] },
              { block: blocks[5 + i], cid: cids[5 + i] }
            ], (blockAndCid, cb) => {
              msg.addBlock(blockAndCid.cid, blockAndCid.block)
              cb()
            }, (err) => {
              expect(err).to.not.exist
              cb(null, msg)
            })
          }, (err, messages) => {
            expect(err).to.not.exist
            let i = 0
            eachSeries(others, (other, cb) => {
              const msg = messages[i]
              i++
              bs._receiveMessage(other, msg, (err) => {
                expect(err).to.not.exist
                hasBlocks(msg, store, cb)
              })
            }, done)
          })
        }
      })
    })

    describe('getStream', () => {
      it('block exists locally', (done) => {
        const block = blocks[4]
        const cid = cids[4]

        pull(
          pull.values([
            { data: block.data, key: cid.multihash }
          ]),
          store.putStream(),
          pull.onEnd((err) => {
            if (err) {
              return done(err)
            }

            const book = new PeerBook()
            const bs = new Bitswap(libp2pMock, store, book)

            pull(
              bs.getStream(cid),
              pull.collect((err, res) => {
                if (err) {
                  return done(err)
                }

                expect(res[0].data).to.eql(block.data)
                done()
              })
            )
          })
        )
      })

      it('blocks exist locally', (done) => {
        const b1 = blocks[5]
        const b2 = blocks[6]
        const b3 = blocks[7]
        const cid1 = cids[5]
        const cid2 = cids[6]
        const cid3 = cids[7]

        pull(
          pull.values([
            { data: b1.data, key: cid1.multihash },
            { data: b2.data, key: cid2.multihash },
            { data: b3.data, key: cid3.multihash }
          ]),
          store.putStream(),
          pull.onEnd((err) => {
            expect(err).to.not.exist

            const book = new PeerBook()
            const bs = new Bitswap(libp2pMock, store, book)

            pull(
              bs.getStream([cid1, cid2, cid3]),
              pull.collect((err, res) => {
                expect(err).to.not.exist

                expect(res[0].data).to.eql(b1.data)
                expect(res[1].data).to.eql(b2.data)
                expect(res[2].data).to.eql(b3.data)
                done()
              })
            )
          })
        )
      })

      it('block is added locally afterwards', (done) => {
        const block = blocks[9]
        const book = new PeerBook()
        const bs = new Bitswap(libp2pMock, store, book)
        const net = utils.mockNetwork()

        bs.network = net
        bs.wm.network = net
        bs.engine.network = net
        bs.start()

        block.key((err, key) => {
          expect(err).to.not.exist
          const cid = new CID(key)
          pull(
            bs.getStream(cid),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res[0].data).to.be.eql(block.data)
              done()
            })
          )

          setTimeout(() => {
            bs.put({
              block: block,
              cid: cid
            }, () => {})
          }, 200)
        })
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
              err = new Error('unkown peer')
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
          start () {},
          stop () {}
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
          start () {},
          stop () {}
        }
        bs1 = new Bitswap(libp2pMock, store, new PeerBook())
        utils.applyNetwork(bs1, n1)
        bs1.start()

        let store2

        waterfall([
          (cb) => repo.create('world', cb),
          (repo, cb) => {
            store2 = repo.blockstore
            bs2 = new Bitswap(libp2pMock, store2, new PeerBook())
            utils.applyNetwork(bs2, n2)
            bs2.start()
            bs1._onPeerConnected(other)
            bs2._onPeerConnected(me)

            block.key((err, key) => {
              expect(err).to.not.exist
              const cid = new CID(key)
              pull(
                bs1.getStream(cid),
                pull.collect((err, res) => {
                  expect(err).to.not.exist
                  cb(null, res[0])
                })
              )

              setTimeout(() => {
                bs2.put({
                  block: block,
                  cid: cid
                })
              }, 1000)
            })
          },
          (res, cb) => {
            // TODO: Ask Fridel if this is what he really meant
            expect(res).to.eql(res)
            cb()
          }
        ], done)
      })
    })

    describe('stat', () => {
      it('has initial stats', () => {
        const bs = new Bitswap(libp2pMock, {}, new PeerBook())

        const stats = bs.stat()
        expect(stats).to.have.property('wantlist')
        expect(stats).to.have.property('blocksReceived', 0)
        expect(stats).to.have.property('dupBlksReceived', 0)
        expect(stats).to.have.property('dupDataReceived', 0)
        expect(stats).to.have.property('peers')
      })
    })

    describe('unwant', () => {
      it('removes blocks that are wanted multiple times', (done) => {
        const bs = new Bitswap(libp2pMock, store, new PeerBook())
        bs.start()
        const b = blocks[11]

        let i = 0
        const finish = () => {
          i++
          if (i === 2) {
            done()
          }
        }
        b.key((err, key) => {
          expect(err).to.not.exist
          pull(
            bs.getStream(new CID(key)),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res).to.be.empty
              finish()
            })
          )
          pull(
            bs.getStream(new CID(key)),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res).to.be.empty
              finish()
            })
          )

          setTimeout(() => bs.unwant(new CID(key)), 10)
        })
      })
    })
  })
}

function hasBlocks (msg, store, cb) {
  each(Array.from(msg.blocks.values()), (b, next) => {
    b.key((err, key) => {
      if (err) {
        return next(err)
      }
      if (!b.cancel) {
        store.has(key, next)
      } else {
        next()
      }
    })
  }, cb)
}
