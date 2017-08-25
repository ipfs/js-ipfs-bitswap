/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const map = require('async/map')
const CID = require('cids')
const _ = require('lodash')
const multihashing = require('multihashing-async')

const Wantlist = require('../../src/types/wantlist')
const makeBlock = require('../utils/make-block')

describe('Wantlist', () => {
  let wm
  let blocks

  before((done) => {
    map(_.range(2), (i, cb) => makeBlock(cb), (err, res) => {
      expect(err).to.not.exist()
      blocks = res
      done()
    })
  })

  beforeEach(() => {
    wm = new Wantlist()
  })

  it('length', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 2)
    wm.add(b2.cid, 1)
    expect(wm).to.have.length(2)
  })

  describe('remove', () => {
    it('removes with a single ref', () => {
      const b = blocks[0]

      wm.add(b.cid, 1)
      wm.remove(b.cid)
      expect(wm).to.have.length(0)
    })

    it('removes with multiple refs', () => {
      const b1 = blocks[0]
      const b2 = blocks[1]

      wm.add(b1.cid, 1)
      wm.add(b2.cid, 2)

      expect(wm).to.have.length(2)

      wm.remove(b2.cid)

      expect(wm).to.have.length(1)

      wm.add(b1.cid, 2)
      wm.remove(b1.cid)

      expect(wm).to.have.length(1)

      wm.remove(b1.cid)
      expect(wm).to.have.length(0)
    })

    it('ignores non existing removes', () => {
      const b = blocks[0]

      wm.add(b.cid, 1)
      wm.remove(b.cid)
      wm.remove(b.cid)

      expect(wm).to.have.length(0)
    })
  })

  it('entries', () => {
    const b = blocks[0]

    wm.add(b.cid, 2)
    expect(
      Array.from(wm.entries())
    ).to.be.eql([[
      b.cid.buffer.toString(),
      new Wantlist.Entry(b.cid, 2)
    ]])
  })

  it('sortedEntries', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 1)
    wm.add(b2.cid, 1)

    expect(
      Array.from(wm.sortedEntries())
    ).to.be.eql([
      [b1.cid.buffer.toString(), new Wantlist.Entry(b1.cid, 1)],
      [b2.cid.buffer.toString(), new Wantlist.Entry(b2.cid, 1)]
    ])
  })

  it('contains', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 2)

    expect(wm.contains(b1.cid)).to.exist()
    expect(wm.contains(b2.cid)).to.not.exist()
  })

  it('with cidV1', (done) => {
    const b = blocks[0]
    multihashing(b.data, 'sha2-256', (err, hash) => {
      expect(err).to.not.exist()
      const cid = new CID(1, 'dag-pb', hash)
      wm.add(cid, 2)

      expect(
        Array.from(wm.entries())
      ).to.be.eql([[
        cid.buffer.toString(),
        new Wantlist.Entry(cid, 2)
      ]])
      done()
    })
  })
})
