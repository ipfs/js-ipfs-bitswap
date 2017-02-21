/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const _ = require('lodash')
const Block = require('ipfs-block')
const parallel = require('async/parallel')
const series = require('async/series')
const map = require('async/map')
const eachSeries = require('async/eachSeries')
const pull = require('pull-stream')
const paramap = require('pull-paramap')
const CID = require('cids')

const Message = require('../../../src/types/message')
const DecisionEngine = require('../../../src/components/decision-engine')

const mockNetwork = require('../../utils').mockNetwork

function messageToString (m) {
  return Array.from(m[1].blocks.values())
    .map((b) => b.block.data.toString())
}

function stringifyMessages (messages) {
  return _.flatten(messages.map(messageToString))
}

module.exports = (repo) => {
  function newEngine (path, done, net) {
    parallel([
      (cb) => repo.create(path, cb),
      (cb) => PeerId.create(cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }
      const blockstore = results[0].blockstore
      const engine = new DecisionEngine(blockstore, net || mockNetwork())
      engine.start()

      done(null, { peer: results[1], engine })
    })
  }

  describe('Engine', () => {
    afterEach((done) => {
      repo.remove(done)
    })

    it('consistent accounting', (done) => {
      parallel([
        (cb) => newEngine('Ernie', cb),
        (cb) => newEngine('Bert', cb)
      ], (err, res) => {
        expect(err).to.not.exist

        const sender = res[0]
        const receiver = res[1]

        pull(
          pull.values(_.range(1000)),
          pull.map((i) => {
            const content = `this is message ${i}`
            return new Block(content)
          }),
          paramap((block, cb) => {
            const m = new Message(false)
            block.key((err, key) => {
              if (err) {
                return cb(err)
              }
              const cid = new CID(key)
              m.addBlock(cid, block)
              sender.engine.messageSent(receiver.peer, block, cid)
              receiver.engine.messageReceived(sender.peer, m, cb)
            })
          }, 100),
          pull.onEnd((err) => {
            expect(err).to.not.exist

            expect(sender.engine.numBytesSentTo(receiver.peer))
              .to.be.above(0)

            expect(sender.engine.numBytesSentTo(receiver.peer))
              .to.eql(receiver.engine.numBytesReceivedFrom(sender.peer))

            expect(receiver.engine.numBytesSentTo(sender.peer))
              .to.eql(0)

            expect(sender.engine.numBytesReceivedFrom(receiver.peer))
              .to.eql(0)

            done()
          })
        )
      })
    })

    it('peer is added to peers when message receiver or sent', (done) => {
      parallel([
        (cb) => newEngine('sf', cb),
        (cb) => newEngine('sea', cb)
      ], (err, res) => {
        expect(err).to.not.exist

        const sanfrancisco = res[0]
        const seattle = res[1]

        const m = new Message(true)
        sanfrancisco.engine.messageSent(seattle.peer)
        seattle.engine.messageReceived(sanfrancisco.peer, m, (err) => {
          expect(err).to.not.exist

          expect(seattle.peer.toHexString())
            .to.not.eql(sanfrancisco.peer.toHexString())

          expect(sanfrancisco.engine.peers()).to.include(seattle.peer)

          expect(seattle.engine.peers())
            .to.include(sanfrancisco.peer)
          done()
        })
      })
    })

    it('partner wants then cancels', (done) => {
      const numRounds = 10
      const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
      const vowels = 'aeiou'.split('')
      const testCases = [
        [alphabet, vowels],
        [alphabet, _.difference(alphabet, vowels)]
      ]

      function partnerWants (dEngine, values, partner, cb) {
        const message = new Message(false)
        const blocks = values.map((k) => new Block(k))

        map(blocks, (b, cb) => b.key(cb), (err, keys) => {
          expect(err).to.not.exist
          keys.forEach((key, i) => {
            const cid = new CID(key)
            message.addEntry(cid, Math.pow(2, 32) - 1 - i)
          })

          dEngine.messageReceived(partner, message, cb)
        })
      }

      function partnerCancels (dEngine, values, partner, cb) {
        const message = new Message(false)
        const blocks = values.map((k) => new Block(k))

        map(blocks, (b, cb) => b.key(cb), (err, keys) => {
          expect(err).to.not.exist
          keys.forEach((key) => {
            const cid = new CID(key)
            message.cancel(cid)
          })
          dEngine.messageReceived(partner, message, cb)
        })
      }

      repo.create('p', (err, repo) => {
        expect(err).to.not.exist

        pull(
          pull.values(alphabet),
          pull.asyncMap((l, cb) => {
            const block = new Block(l)
            block.key((err, key) => {
              if (err) {
                return cb(err)
              }
              cb(null, { data: block.data, key: key })
            })
          }),
          repo.blockstore.putStream(),
          pull.onEnd((err) => {
            expect(err).to.not.exist

            eachSeries(_.range(numRounds), (i, cb) => {
              // 2 test cases
              //   a) want alphabet - cancel vowels
              //   b) want alphabet - cancels everything except vowels

              eachSeries(testCases, (testcase, innerCb) => {
                const set = testcase[0]
                const cancels = testcase[1]
                const keeps = _.difference(set, cancels)

                const network = mockNetwork(1, (res) => {
                  const msgs = stringifyMessages(res.messages)
                  expect(msgs.sort()).to.eql(keeps.sort())
                  innerCb()
                })

                const dEngine = new DecisionEngine(repo.blockstore, network)
                dEngine.start()

                let partner
                series([
                  (cb) => PeerId.create((err, id) => {
                    if (err) {
                      return cb(err)
                    }
                    partner = id
                    cb()
                  }),
                  (cb) => partnerWants(dEngine, set, partner, cb),
                  (cb) => partnerCancels(dEngine, cancels, partner, cb)
                ], (err) => {
                  expect(err).to.not.exist
                })
              }, cb)
            }, done)
          })
        )
      })
    })

    it('splits large block messages', (done) => {
      const data = _.range(10).map((i) => {
        const b = new Buffer(1024 * 256)
        b.fill(i)
        return b
      })
      const blocks = _.range(10).map((i) => {
        return new Block(data[i])
      })

      const net = mockNetwork(5, (res) => {
        expect(res.messages).to.have.length(5)
        done()
      })

      parallel([
        (cb) => newEngine('sf', cb, net),
        (cb) => map(blocks, (b, cb) => b.key(cb), cb)
      ], (err, res) => {
        expect(err).to.not.exist
        const sf = res[0].engine
        const cids = res[1].map((c) => new CID(c))
        const id = res[0].peer

        pull(
          pull.values(blocks.map((b, i) => ({
            data: b.data, key: cids[i].multihash
          }))),
          sf.blockstore.putStream(),
          pull.onEnd((err) => {
            expect(err).to.not.exist
            const msg = new Message(false)
            cids.forEach((c, i) => {
              msg.addEntry(c, Math.pow(2, 32) - 1 - i)
            })

            sf.messageReceived(id, msg, (err) => {
              expect(err).to.not.exist
            })
          })
        )
      })
    })
  })
}
