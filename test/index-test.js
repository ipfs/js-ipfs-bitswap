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

const Message = require('../src/message')
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

        done()
      })
    })

    after((done) => {
      repo.remove(done)
    })

    describe('receive message', () => {
      it('simple block message', (done) => {
        const me = ids[0]
        const book = new PeerBook()
        const bs = new Bitswap(me, libp2pMock, store, book)
        bs.start()

        const other = ids[1]
        const b1 = blocks[0]
        const b2 = blocks[1]
        const msg = new Message(false)
        each([b1, b2], (b, cb) => msg.addBlock(b, cb), (err) => {
          expect(err).to.not.exist

          bs._receiveMessage(other, msg, (err) => {
            if (err) {
              throw err
            }

            expect(bs.blocksRecvd).to.be.eql(2)
            expect(bs.dupBlocksRecvd).to.be.eql(0)

            pull(
              pull.values([b1, b2]),
              pull.asyncMap((b, cb) => b.key(cb)),
              pull.map((key) => store.getStream(key)),
              pull.flatten(),
              pull.collect((err, blocks) => {
                if (err) return done(err)

                expect(blocks[0].data).to.be.eql(b1.data)
                expect(blocks[1].data).to.be.eql(b2.data)
                done()
              })
            )
          })
        })
      })

      it('simple want message', (done) => {
        const me = ids[0]
        const book = new PeerBook()
        const bs = new Bitswap(me, libp2pMock, store, book)
        bs.start()

        const other = ids[1]
        const b1 = blocks[2]
        const b2 = blocks[3]
        const msg = new Message(false)
        parallel([
          (cb) => b1.key(cb),
          (cb) => b2.key(cb)
        ], (err, keys) => {
          expect(err).to.not.exist

          msg.addEntry(keys[0], 1, false)
          msg.addEntry(keys[1], 1, false)

          bs._receiveMessage(other, msg, (err) => {
            expect(err).to.not.exist

            expect(bs.blocksRecvd).to.be.eql(0)
            expect(bs.dupBlocksRecvd).to.be.eql(0)

            const wl = bs.wantlistForPeer(other)

            expect(wl.has(keys[0].toString('hex'))).to.be.eql(true)
            expect(wl.has(keys[1].toString('hex'))).to.be.eql(true)

            done()
          })
        })
      })

      it('multi peer', (done) => {
        const me = ids[0]
        const book = new PeerBook()
        const bs = new Bitswap(me, libp2pMock, store, book)
        bs.start()

        parallel([
          (cb) => map(_.range(5), (i, cb) => PeerId.create(cb), cb),
          (cb) => cb(null, _.range(10).map((i) => new Block(`hello ${i}`)))
        ], (err, results) => {
          if (err) {
            return done(err)
          }

          const others = results[0]
          const blocks = results[1]

          map(_.range(5), (i, cb) => {
            const m = new Message(false)
            each(
              [blocks[i], blocks[5 + i]],
              (b, cb) => m.addBlock(b, cb),
              (err) => {
                if (err) {
                  return cb(err)
                }
                cb(null, m)
              }
            )
          }, (err, messages) => {
            expect(err).to.not.exist
            let i = 0
            eachSeries(others, (other, cb) => {
              const msg = messages[i]
              i++
              bs._receiveMessage(other, msg, (err) => {
                if (err) return cb(err)
                hasBlocks(msg, store, cb)
              })
            }, done)
          })
        })
      })
    })

    describe('getStream', () => {
      it('block exists locally', (done) => {
        const me = ids[0]
        const block = blocks[4]
        pull(
          pull.values([block]),
          pull.asyncMap(blockToStore),
          store.putStream(),
          pull.onEnd((err) => {
            if (err) {
              return done(err)
            }

            const book = new PeerBook()
            const bs = new Bitswap(me, libp2pMock, store, book)

            pull(
              pull.values([block]),
              pull.asyncMap((b, cb) => b.key(cb)),
              pull.map((key) => bs.getStream(key)),
              pull.flatten(),
              pull.collect((err, res) => {
                if (err) {
                  return done(err)
                }

                expect(res[0].data).to.be.eql(block.data)
                done()
              })
            )
          })
        )
      })

      it('blocks exist locally', (done) => {
        const me = ids[0]
        const b1 = blocks[5]
        const b2 = blocks[6]
        const b3 = blocks[7]

        pull(
          pull.values([b1, b2, b3]),
          pull.asyncMap(blockToStore),
          store.putStream(),
          pull.onEnd((err) => {
            expect(err).to.not.exist

            const book = new PeerBook()
            const bs = new Bitswap(me, libp2pMock, store, book)

            pull(
              pull.values([b1, b2, b3]),
              pull.asyncMap((b, cb) => b.key(cb)),
              pull.collect((err, keys) => {
                expect(err).to.not.exist
                pull(
                  bs.getStream(keys),
                  pull.collect((err, res) => {
                    expect(err).to.not.exist

                    expect(res[0].data).to.be.eql(b1.data)
                    expect(res[1].data).to.be.eql(b2.data)
                    expect(res[2].data).to.be.eql(b3.data)
                    done()
                  })
                )
              })
            )
          })
        )
      })

      // Not sure if I understand what is going on here
      // test fails because now the network is not properly mocked
      // what are these net.stores and mockNet.bitswaps?
      it.skip('block is retrived from peer', (done) => {
        const block = blocks[8]

        let mockNet
        waterfall([
          (cb) => utils.createMockNet(repo, 2, cb),
          (net, cb) => {
            mockNet = net
            net.stores[1].put(block, cb)
          },
          (val, cb) => {
            mockNet.bitswaps[0]._onPeerConnected(mockNet.ids[1])
            mockNet.bitswaps[1]._onPeerConnected(mockNet.ids[0])
            pull(
              pull.values([block]),
              pull.asyncMap((b, cb) => b.key(cb)),
              pull.map((key) => mockNet.bitswaps[0].getStream(key)),
              pull.flatten(),
              pull.collect((err, res) => {
                if (err) {
                  return cb(err)
                }
                cb(null, res[0])
              })
            )
          },
          (res, cb) => {
            expect(res).to.be.eql(block)
            cb()
          }
        ], done)
      })

      it('block is added locally afterwards', (done) => {
        const me = ids[0]
        const block = blocks[9]
        const book = new PeerBook()
        const bs = new Bitswap(me, libp2pMock, store, book)
        const net = utils.mockNetwork()
        bs.network = net
        bs.wm.network = net
        bs.engine.network = net
        bs.start()

        block.key((err, key) => {
          expect(err).to.not.exist
          pull(
            bs.getStream(key),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res[0].data).to.be.eql(block.data)
              done()
            })
          )

          setTimeout(() => {
            bs.put({
              data: block.data,
              key: key
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
        bs1 = new Bitswap(me, libp2pMock, store, new PeerBook())
        utils.applyNetwork(bs1, n1)
        bs1.start()

        let store2

        waterfall([
          (cb) => repo.create('world', cb),
          (repo, cb) => {
            store2 = repo.blockstore
            bs2 = new Bitswap(other, libp2pMock, store2, new PeerBook())
            utils.applyNetwork(bs2, n2)
            bs2.start()
            bs1._onPeerConnected(other)
            bs2._onPeerConnected(me)

            block.key((err, key) => {
              expect(err).to.not.exist
              pull(
                bs1.getStream(key),
                pull.collect((err, res) => {
                  expect(err).to.not.exist
                  cb(null, res[0])
                })
              )

              setTimeout(() => {
                bs2.put({
                  data: block.data,
                  key: key
                })
              }, 1000)
            })
          },
          (res, cb) => {
            expect(res).to.be.eql(res)
            cb()
          }
        ], done)
      })
    })

    describe('stat', () => {
      it('has initial stats', () => {
        const me = ids[0]
        const bs = new Bitswap(me, libp2pMock, {}, new PeerBook())

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
        const me = ids[0]
        const bs = new Bitswap(me, libp2pMock, store, new PeerBook())
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
            bs.getStream(key),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res).to.be.empty
              finish()
            })
          )
          pull(
            bs.getStream(key),
            pull.collect((err, res) => {
              expect(err).to.not.exist
              expect(res).to.be.empty
              finish()
            })
          )

          setTimeout(() => bs.unwant(key), 10)
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

function blockToStore (b, cb) {
  b.key((err, key) => {
    if (err) {
      return cb(err)
    }

    cb(null, {data: b.data, key: key})
  })
}
