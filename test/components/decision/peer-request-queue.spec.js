/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const Block = require('ipfs-block')
const _includes = require('lodash.includes')
const _range = require('lodash.range')
const map = require('async/map')
const each = require('async/each')
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')
const CID = require('cids')

const WantlistEntry = require('../../../src/types/wantlist').Entry
const PeerRequestQueue = require('../../../src/components/decision/peer-request-queue')

function getBlockCID (data, callback) {
  const block = new Block(data)
  block.key((err, key) => {
    if (err) {
      return callback(err)
    }

    callback(null, new CID(key))
  })
}

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
        .filter((a) => !_includes(vowels, a))
        .sort()
        .map((c) => alphabet.indexOf(c))

      map(alphabet, getBlockCID, (err, cids) => {
        if (err) {
          return done(err)
        }

        alphabet.forEach((a, i) => {
          prq.push(new WantlistEntry(cids[i], Math.pow(2, 32) - 1 - i), partner)
        })

        consonants.forEach((c) => {
          prq.remove(cids[c], partner)
        })

        const out = []
        alphabet.forEach(() => {
          const rec = prq.pop()
          if (!rec) {
            return
          }
          out.push(rec.entry.cid)
        })

        expect(out.length).to.eql(vowels.length)

        vowelsIndex.forEach((v, i) => {
          expect(out[i].toString('hex'))
            .to.eql(cids[v].toString('hex'))
        })
        done()
      })
    })
  })

  it('peer repeats', (done) => {
    // This test checks that peers wont starve out other peers
    const prq = new PeerRequestQueue()

    waterfall([
      (cb) => map(_range(4), (i, cb) => PeerId.create({bits: 1024}, cb), cb),
      (peers, cb) => {
        each(_range(5), (i, cb) => {
          getBlockCID('hello-' + i, (err, cid) => {
            if (err) {
              return cb(err)
            }
            peers.forEach((peer) => {
              prq.push(new WantlistEntry(cid), peer)
            })
            cb()
          })
        }, (err) => {
          if (err) {
            return cb(err)
          }
          let targets = []
          const tasks = []

          _range(4).forEach((i) => {
            const t = prq.pop()
            targets.push(t.target.toHexString())
            tasks.push(t)
          })

          const expected = peers.map((p) => p.toHexString()).sort()
          targets = targets.sort()

          expect(targets).to.eql(expected)

          // Now, if one of the tasks gets finished, the next task
          // off the queue should be for the same peer
          _range(3).forEach((blockI) => {
            _range(3).forEach((i) => {
              // its okay to mark the same task done multiple
              // times here (JUST FOR TESTING)
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
      (cb) => getBlockCID(new Buffer('hello'), cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }
      const partner = results[0]
      const cid = results[1]
      prq.push(new WantlistEntry(cid), partner)
      prq.push(new WantlistEntry(cid), partner)

      expect(prq.pop()).to.exist
      expect(prq.pop()).to.not.exist
      done()
    })
  })
})
