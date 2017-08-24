/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const _ = require('lodash')
const Block = require('ipfs-block')
const parallel = require('async/parallel')
const series = require('async/series')
const map = require('async/map')
const each = require('async/each')
const waterfall = require('async/waterfall')
const eachSeries = require('async/eachSeries')
const CID = require('cids')
const multihashing = require('multihashing-async')
const Buffer = require('safe-buffer').Buffer

const Message = require('../../src/types/message')
const DecisionEngine = require('../../src/decision-engine')
const createTempRepo = require('../utils/create-temp-repo-nodejs.js')

const mockNetwork = require('../utils/mocks').mockNetwork

function messageToString (m) {
  return Array.from(m[1].blocks.values())
    .map((b) => b.data.toString())
}

function stringifyMessages (messages) {
  return _.flatten(messages.map(messageToString))
}

function newEngine (network, callback) {
  parallel([
    (cb) => createTempRepo(cb),
    (cb) => PeerId.create({bits: 1024}, cb)
  ], (err, results) => {
    if (err) {
      return callback(err)
    }
    const blockstore = results[0].blocks
    const peerId = results[1]
    const engine = new DecisionEngine(peerId, blockstore, network || mockNetwork())
    engine.start((err) => callback(err, { peer: peerId, engine: engine }))
  })
}

describe('Engine', () => {
  it('consistent accounting', (done) => {
    parallel([
      (cb) => newEngine(false, cb),
      (cb) => newEngine(false, cb)
    ], (err, res) => {
      expect(err).to.not.exist()

      const sender = res[0]
      const receiver = res[1]

      map(_.range(1000), (i, cb) => {
        const data = Buffer.from(`this is message ${i}`)
        multihashing(data, 'sha2-256', (err, hash) => {
          expect(err).to.not.exist()

          const m = new Message(false)
          const block = new Block(data, new CID(hash))
          m.addBlock(block)
          sender.engine.messageSent(receiver.peer, block)
          receiver.engine.messageReceived(sender.peer, m, cb)
        })
      }, (err) => {
        expect(err).to.not.exist()
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
    })
  })

  it('peer is added to peers when message receiver or sent', (done) => {
    parallel([
      (cb) => newEngine(false, cb),
      (cb) => newEngine(false, cb)
    ], (err, res) => {
      expect(err).to.not.exist()

      const sanfrancisco = res[0]
      const seattle = res[1]

      const m = new Message(true)
      sanfrancisco.engine.messageSent(seattle.peer)

      seattle.engine.messageReceived(sanfrancisco.peer, m, (err) => {
        expect(err).to.not.exist()

        expect(seattle.peer.toHexString())
          .to.not.eql(sanfrancisco.peer.toHexString())
        expect(sanfrancisco.engine.peers()).to.include(seattle.peer)
        expect(seattle.engine.peers()).to.include(sanfrancisco.peer)

        done()
      })
    })
  })

  it('partner wants then cancels', function (done) {
    this.timeout(40 * 1000)

    const numRounds = 10
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
    const vowels = 'aeiou'.split('')
    const testCases = [
      [alphabet, vowels],
      [alphabet, _.difference(alphabet, vowels)]
    ]

    function partnerWants (dEngine, values, partner, cb) {
      const message = new Message(false)

      map(values, (v, cb) => multihashing(Buffer.from(v), 'sha2-256', cb), (err, hashes) => {
        expect(err).to.not.exist()
        hashes.forEach((hash, i) => {
          message.addEntry(new CID(hash), Math.pow(2, 32) - 1 - i)
        })

        dEngine.messageReceived(partner, message, cb)
      })
    }

    function partnerCancels (dEngine, values, partner, cb) {
      const message = new Message(false)

      map(values, (v, cb) => multihashing(Buffer.from(v), 'sha2-256', cb), (err, hashes) => {
        expect(err).to.not.exist()
        hashes.forEach((hash) => {
          message.cancel(new CID(hash))
        })
        dEngine.messageReceived(partner, message, cb)
      })
    }

    createTempRepo((err, repo) => {
      expect(err).to.not.exist()

      waterfall([
        (cb) => map(alphabet,
          (v, cb) => multihashing(Buffer.from(v), 'sha2-256', cb),
          cb
        ),
        (hashes, cb) => each(
          hashes.map((h, i) => {
            return new Block(Buffer.from(alphabet[i]), new CID(h))
          }),
          (b, cb) => repo.blocks.put(b, cb),
          cb
        ),
        (cb) => eachSeries(_.range(numRounds), (i, cb) => {
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

            PeerId.create({bits: 1024}, (err, id) => {
              expect(err).to.not.exist()
              const dEngine = new DecisionEngine(id, repo.blocks, network)
              dEngine.start((err) => {
                expect(err).to.not.exist()

                let partner
                series([
                  (cb) => PeerId.create({bits: 1024}, (err, id) => {
                    if (err) { return cb(err) }
                    partner = id
                    cb()
                  }),
                  (cb) => partnerWants(dEngine, set, partner, cb),
                  (cb) => partnerCancels(dEngine, cancels, partner, cb)
                ], (err) => {
                  expect(err).to.not.exist()
                })
              })
            })
          }, cb)
        }, cb)
      ], done)
    })
  })

  it('splits large block messages', (done) => {
    const data = _.range(10).map((i) => {
      const b = Buffer.alloc(1024 * 256)
      b.fill(i)
      return b
    })

    const net = mockNetwork(5, (res) => {
      expect(res.messages).to.have.length(5)
      done()
    })

    parallel([
      (cb) => newEngine(net, cb),
      (cb) => map(data, (d, cb) => multihashing(d, 'sha2-256', (err, hash) => {
        expect(err).to.not.exist()
        cb(null, new Block(d, new CID(hash)))
      }), cb)
    ], (err, res) => {
      expect(err).to.not.exist()
      const sf = res[0].engine
      const id = res[0].peer

      const blocks = res[1]
      const cids = blocks.map((b) => b.cid)

      each(blocks, (b, cb) => sf.blockstore.put(b, cb), (err) => {
        expect(err).to.not.exist()
        const msg = new Message(false)
        cids.forEach((c, i) => msg.addEntry(c, Math.pow(2, 32) - 1 - i))

        sf.messageReceived(id, msg, (err) => {
          expect(err).to.not.exist()
        })
      })
    })
  })
})
