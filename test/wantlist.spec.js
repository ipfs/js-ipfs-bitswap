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
    map([
      'hello',
      'world'
    ], Block.create, (err, _blocks) => {
      if (err) {
        return done(err)
      }
      blocks = _blocks
      done()
    })
  })

  beforeEach(() => {
    wm = new Wantlist()
  })

  it('length', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.key, 2)
    wm.add(b2.key, 1)

    expect(wm).to.have.length(2)
  })

  describe('remove', () => {
    it('removes with a single ref', () => {
      const b = blocks[0]

      wm.add(b.key, 1)
      wm.remove(b.key)

      expect(wm).to.have.length(0)
    })

    it('removes with multiple refs', () => {
      const b1 = blocks[0]
      const b2 = blocks[1]

      wm.add(b1.key, 1)
      wm.add(b2.key, 2)

      expect(wm).to.have.length(2)

      wm.remove(b2.key)

      expect(wm).to.have.length(1)

      wm.add(b1.key, 2)
      wm.remove(b1.key)

      expect(wm).to.have.length(1)

      wm.remove(b1.key)

      expect(wm).to.have.length(0)
    })

    it('ignores non existing removes', () => {
      const b = blocks[0]

      wm.add(b.key, 1)
      wm.remove(b.key)
      wm.remove(b.key)

      expect(wm).to.have.length(0)
    })
  })

  it('entries', () => {
    const b = blocks[0]
    wm.add(b.key, 2)

    expect(
      Array.from(wm.entries())
    ).to.be.eql([
      [mh.toB58String(b.key), new Wantlist.Entry(b.key, 2)]
    ])
  })

  it('sortedEntries', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b2.key, 1)
    wm.add(b1.key, 1)

    expect(
      Array.from(wm.sortedEntries())
    ).to.be.eql([
      [mh.toB58String(b1.key), new Wantlist.Entry(b1.key, 1)],
      [mh.toB58String(b2.key), new Wantlist.Entry(b2.key, 1)]
    ])
  })

  it('contains', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]
    wm.add(b1.key, 2)

    expect(
      wm.contains(b1.key)
    ).to.exist

    expect(
      wm.contains(b2.key)
    ).to.not.exist
  })
})
