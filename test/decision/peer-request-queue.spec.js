/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const _ = require('lodash')
const Block = require('ipfs-block')
const map = require('async/map')
const each = require('async/each')
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')

const hash = (data, cb) => Block.create(data, (err, block) => {
  if (err) {
    return cb(err)
  }

  cb(null, block.key)
})

const WantlistEntry = require('../../src/wantlist').Entry
const PeerRequestQueue = require('../../src/decision/peer-request-queue')

describe('PeerRequestQueue', () => {
  it('push and pop', (done) => {
    const prq = new PeerRequestQueue()
    PeerId.create({bits: 1024}, (err, partner) => {
      if (err) {
        return done(err)
      }

      const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('').sort()
      const vowels = 'aeiou'.split('').sort()
      const vowelsIndex = vowels.map((v) => alphabet.indexOf(v))
      const consonants = alphabet
        .filter((a) => !_.includes(vowels, a))
        .sort()
        .map((c) => alphabet.indexOf(c))

      map(alphabet, hash, (err, hashes) => {
        if (err) {
          return done(err)
        }

        alphabet.forEach((a, i) => {
          prq.push(new WantlistEntry(hashes[i], Math.pow(2, 32) - 1 - i), partner)
        })

        consonants.forEach((c) => {
          prq.remove(hashes[c], partner)
        })

        const out = []
        alphabet.forEach(() => {
          const rec = prq.pop()
          if (!rec) return
          out.push(rec.entry.key)
        })

        expect(out.length).to.be.eql(vowels.length)

        vowelsIndex.forEach((v, i) => {
          expect(
            out[i].toString('hex')
          ).to.be.eql(
            hashes[v].toString('hex')
          )
        })
        done()
      })
    })
  })

  it('peer repeats', (done) => {
    // This test checks that peers wont starve out other peers
    const prq = new PeerRequestQueue()

    waterfall([
      (cb) => map(_.range(4), (i, cb) => PeerId.create({bits: 1024}, cb), cb),
      (peers, cb) => {
        each(_.range(5), (i, cb) => {
          hash('hello-' + i, (err, digest) => {
            if (err) {
              return cb(err)
            }
            peers.forEach((peer) => {
              prq.push(new WantlistEntry(digest), peer)
            })
            cb()
          })
        }, (err) => {
          if (err) {
            return cb(err)
          }
          let targets = []
          const tasks = []

          _.range(4).forEach((i) => {
            const t = prq.pop()
            targets.push(t.target.toHexString())
            tasks.push(t)
          })

          const expected = peers.map((p) => p.toHexString()).sort()
          targets = targets.sort()

          expect(targets).to.be.eql(expected)

          // Now, if one of the tasks gets finished, the next task off the queue should
          // be for the same peer
          _.range(3).forEach((blockI) => {
            _.range(3).forEach((i) => {
              // its okay to mark the same task done multiple times here (JUST FOR TESTING)
              tasks[i].done()
              const ntask = prq.pop()
              expect(ntask.target).to.be.eql(tasks[i].target)
            })
          })
          cb()
        })
      }
    ], done)
  })

  it('push same block multiple times', (done) => {
    const prq = new PeerRequestQueue()
    parallel([
      (cb) => PeerId.create({bits: 1024}, cb),
      (cb) => hash('hello', cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }
      const partner = results[0]
      const digest = results[1]
      prq.push(new WantlistEntry(digest), partner)
      prq.push(new WantlistEntry(digest), partner)

      expect(prq.pop()).to.exist
      expect(prq.pop()).to.not.exist
      done()
    })
  })
})
