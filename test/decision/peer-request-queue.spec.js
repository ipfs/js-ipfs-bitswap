/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const _ = require('lodash')
const hash = require('ipfs-blocks').util.hash

const WantlistEntry = require('../../src/wantlist/entry')
const PeerRequestQueue = require('../../src/decision/peer-request-queue')

describe('PeerRequestQueue', () => {
  it('push and pop', () => {
    const prq = new PeerRequestQueue()
    const partner = PeerId.create({bits: 64})
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('').sort()
    const vowels = 'aeiou'.split('').sort()
    const consonants = alphabet.filter((a) => !_.includes(vowels, a)).sort()

    alphabet.forEach((a, i) => {
      prq.push(new WantlistEntry(hash(a), Math.pow(2, 32) - 1 - i), partner)
    })

    consonants.forEach((c) => {
      prq.remove(hash(c), partner)
    })

    const out = []
    alphabet.forEach(() => {
      const rec = prq.pop()
      if (!rec) return
      out.push(rec.entry.key)
    })

    expect(out.length).to.be.eql(vowels.length)

    vowels.forEach((v, i) => {
      expect(
        out[i].toString('hex')
      ).to.be.eql(
        hash(v).toString('hex')
      )
    })
  })

  it('peer repeats', () => {
    // This test checks that peers wont starve out other peers
    const prq = new PeerRequestQueue()
    const peers = _.range(4).map(() => PeerId.create({bits: 64}))

    _.range(5).map((i) => {
      peers.forEach((peer) => {
        prq.push(new WantlistEntry(hash('hello-' + i)), peer)
      })
    })

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
  })
})
