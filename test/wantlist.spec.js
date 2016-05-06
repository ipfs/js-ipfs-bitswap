/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Block = require('ipfs-block')

const Wantlist = require('../src/wantlist')

describe('Wantlist', () => {
  let wm
  beforeEach(() => {
    wm = new Wantlist()
  })

  it('length', () => {
    const b1 = new Block('hello')
    const b2 = new Block('world')

    wm.add(b1.key, 2)
    wm.add(b2.key, 1)

    expect(wm).to.have.length(2)
  })

  describe('remove', () => {
    it('removes with a single ref', () => {
      const b = new Block('hello')

      wm.add(b.key, 1)
      wm.remove(b.key)

      expect(wm).to.have.length(0)
    })

    it('removes with multiple refs', () => {
      const b1 = new Block('hello')
      const b2 = new Block('world')

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
      const b = new Block('hello')

      wm.add(b.key, 1)
      wm.remove(b.key)
      wm.remove(b.key)

      expect(wm).to.have.length(0)
    })
  })

  it('entries', () => {
    const b = new Block('hello')
    wm.add(b.key, 2)

    expect(
      Array.from(wm.entries())
    ).to.be.eql([
      [b.key.toString('hex'), new Wantlist.Entry(b.key, 2)]
    ])
  })

  it('sortedEntries', () => {
    const b1 = new Block('hello')
    const b2 = new Block('world')

    wm.add(b2.key, 1)
    wm.add(b1.key, 1)

    expect(
      Array.from(wm.sortedEntries())
    ).to.be.eql([
      [b1.key.toString('hex'), new Wantlist.Entry(b1.key, 1)],
      [b2.key.toString('hex'), new Wantlist.Entry(b2.key, 1)]
    ])
  })

  it('contains', () => {
    const b1 = new Block('hello')
    const b2 = new Block('world')
    wm.add(b1.key, 2)

    expect(
      wm.contains(b1.key)
    ).to.exist

    expect(
      wm.contains(b2.key)
    ).to.not.exist
  })
})
