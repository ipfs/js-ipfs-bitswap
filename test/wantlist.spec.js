/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Block = require('ipfs-block')
const mh = require('multihashes')
const map = require('async/map')

const Wantlist = require('../src/wantlist')

describe('Wantlist', () => {
  let wm
  let blocks

  before((done) => {
    const data = ['hello', 'world']
    blocks = data.map((d) => new Block(d))
    done()
  })

  beforeEach(() => {
    wm = new Wantlist()
  })

  it('length', (done) => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    map([b1, b2], (b, cb) => b.key(cb), (err, keys) => {
      expect(err).to.not.exist
      wm.add(keys[0], 2)
      wm.add(keys[1], 1)

      expect(wm).to.have.length(2)
      done()
    })
  })

  describe('remove', () => {
    it('removes with a single ref', (done) => {
      const b = blocks[0]

      b.key((err, key) => {
        expect(err).to.not.exist
        wm.add(key, 1)
        wm.remove(key)

        expect(wm).to.have.length(0)
        done()
      })
    })

    it('removes with multiple refs', (done) => {
      const b1 = blocks[0]
      const b2 = blocks[1]

      map([b1, b2], (b, cb) => b.key(cb), (err, keys) => {
        expect(err).to.not.exist
        wm.add(keys[0], 1)
        wm.add(keys[1], 2)

        expect(wm).to.have.length(2)

        wm.remove(keys[1])

        expect(wm).to.have.length(1)

        wm.add(keys[0], 2)
        wm.remove(keys[0])

        expect(wm).to.have.length(1)

        wm.remove(keys[0])

        expect(wm).to.have.length(0)
        done()
      })
    })

    it('ignores non existing removes', (done) => {
      const b = blocks[0]

      b.key((err, key) => {
        expect(err).to.not.exist
        wm.add(key, 1)
        wm.remove(key)
        wm.remove(key)

        expect(wm).to.have.length(0)
        done()
      })
    })
  })

  it('entries', (done) => {
    const b = blocks[0]
    b.key((err, key) => {
      expect(err).to.not.exist
      wm.add(key, 2)

      expect(
        Array.from(wm.entries())
      ).to.be.eql([
        [mh.toB58String(key), new Wantlist.Entry(key, 2)]
      ])
      done()
    })
  })

  it('sortedEntries', (done) => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    map([b1, b2], (b, cb) => b.key(cb), (err, keys) => {
      expect(err).to.not.exist
      wm.add(keys[1], 1)
      wm.add(keys[0], 1)

      expect(
        Array.from(wm.sortedEntries())
      ).to.be.eql([
        [mh.toB58String(keys[0]), new Wantlist.Entry(keys[0], 1)],
        [mh.toB58String(keys[1]), new Wantlist.Entry(keys[1], 1)]
      ])
      done()
    })
  })

  it('contains', (done) => {
    const b1 = blocks[0]
    const b2 = blocks[1]
    map([b1, b2], (b, cb) => b.key(cb), (err, keys) => {
      expect(err).to.not.exist
      wm.add(keys[0], 2)

      expect(
        wm.contains(keys[0])
      ).to.exist

      expect(
        wm.contains(keys[1])
      ).to.not.exist
      done()
    })
  })
})
