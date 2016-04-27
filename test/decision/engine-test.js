/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const _ = require('lodash')
const Block = require('ipfs-block')
const async = require('async')

const Message = require('../../src/message')
const Engine = require('../../src/decision/engine')

module.exports = (repo) => {
  function newEngine (id, done) {
    repo.create(id, (err, repo) => {
      if (err) return done(err)

      done(null, {
        peer: new PeerId(id),
        engine: new Engine(repo.datastore)
      })
    })
  }

  describe('Engine', () => {
    afterEach((done) => {
      repo.remove(done)
    })

    it('consistent accounting', (done) => {
      async.parallel([
        (cb) => newEngine('Ernie', cb),
        (cb) => newEngine('Bert', cb)
      ], (err, res) => {
        expect(err).to.not.exist

        const sender = res[0]
        const receiver = res[1]

        async.eachSeries(_.range(1000), (i, cb) => {
          const m = new Message(false)
          const content = `this is message ${i}`
          m.addBlock(new Block(content))
          sender.engine.messageSent(receiver.peer, m)
          receiver.engine.messageReceived(sender.Peer, m, cb)
        }, (err) => {
          expect(err).to.not.exist

          expect(
            sender.engine.numBytesSentTo(receiver.peer)
          ).to.be.above(
            0
          )

          expect(
            sender.engine.numBytesSentTo(receiver.peer)
          ).to.be.eql(
            receiver.engine.numBytesReceivedFrom(sender.peers)
          )

          expect(
            receiver.engine.numBytesSentTo(sender.peer)
          ).to.be.eql(
            0
          )

          expect(
            sender.engine.numBytesReceivedFrom(receiver.peer)
          ).to.be.eql(
            0
          )

          done()
        })
      })
    })

    it('peer is added to peers when message receiver or sent', (done) => {
      async.parallel([
        (cb) => newEngine('sf', cb),
        (cb) => newEngine('sea', cb)
      ], (err, res) => {
        expect(err).to.not.exist

        const sanfrancisco = res[0]
        const seatlle = res[1]

        const m = new Message(true)

        sanfrancisco.engine.messageSent(seatlle.peer, m)
        seatlle.engine.messageReceived(sanfrancisco.peer, m, (err) => {
          expect(err).to.not.exist

          expect(
            seatlle.peer.toHexString()
          ).to.not.be.eql(
            sanfrancisco.peer.toHexString()
          )

          expect(
            sanfrancisco.engine.peers()
          ).to.include(
            seatlle.peer
          )

          expect(
            seatlle.engine.peers()
          ).to.include(
            sanfrancisco.peer
          )
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

      repo.create('p', (err, repo) => {
        expect(err).to.not.exist

        async.each(alphabet, (letter, cb) => {
          const block = new Block(letter)
          repo.datastore.put(block, cb)
        }, (err) => {
          expect(err).to.not.exist

          const partnerWants = (e, keys, p, cb) => {
            const add = new Message(false)
            keys.forEach((letter, i) => {
              const block = new Block(letter)
              add.addEntry(block.key, Math.pow(2, 32) - 1 - i)
            })
            e.messageReceived(p, add, cb)
          }

          const partnerCancels = (e, keys, p, cb) => {
            const cancels = new Message(false)
            keys.forEach((k) => {
              const block = new Block(k)
              cancels.cancel(block.key)
            })
            e.messageReceived(p, cancels, cb)
          }

          const checkHandledInOrder = (e, keys, cb) => {
            async.eachSeries(keys, (k, innerCb) => {
              e.outbox.pull((err, res) => {
                expect(err).to.not.exist

                expect(
                  res.block.key.toString('hex')
                ).to.be.eql(
                  (new Block(k)).key.toString('hex')
                )
                innerCb()
              })
            }, cb)
          }

          async.eachSeries(_.range(numRounds), (i, cb) => {
            async.eachSeries(testCases, (testcase, innerCb) => {
              const set = testcase[0]
              const cancels = testcase[1]
              const keeps = _.difference(set, cancels)

              const e = new Engine(repo.datastore)
              const partner = PeerId.create({bits: 64})
              async.series([
                (c) => partnerWants(e, set, partner, c),
                (c) => partnerCancels(e, cancels, partner, c),
                (c) => checkHandledInOrder(e, keeps, c)
              ], innerCb)
            }, cb)
          }, done)
        })
      })
    })
  })
}
