/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Block = require('ipfs-block')
const map = require('async/map')
const CID = require('cids')

const Wantlist = require('../../src/types/wantlist')

describe.only('Wantlist', () => {
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

    map([
      b1,
      b2
    ],
    (b, cb) => b.key(cb),
    (err, keys) => {
      expect(err).to.not.exist
      wm.add(new CID(keys[0]), 2)
      wm.add(new CID(keys[1]), 1)
      expect(wm).to.have.length(2)
      done()
    })
  })

  describe('remove', () => {
    it('removes with a single ref', (done) => {
      const b = blocks[0]

      b.key((err, key) => {
        expect(err).to.not.exist
        wm.add(new CID(key), 1)
        wm.remove(new CID(key))
        expect(wm).to.have.length(0)
        done()
      })
    })

    it('removes with multiple refs', (done) => {
      const b1 = blocks[0]
      const b2 = blocks[1]

      map([
        b1,
        b2
      ],
      (b, cb) => b.key(cb),
      (err, keys) => {
        expect(err).to.not.exist
        const cid1 = new CID(keys[0])
        const cid2 = new CID(keys[1])

        wm.add(cid1, 1)
        wm.add(cid2, 2)

        expect(wm).to.have.length(2)

        wm.remove(cid2)

        expect(wm).to.have.length(1)

        wm.add(cid1, 2)
        wm.remove(cid1)

        expect(wm).to.have.length(1)

        wm.remove(cid1)
        expect(wm).to.have.length(0)
        done()
      })
    })

    it('ignores non existing removes', (done) => {
      const b = blocks[0]

      b.key((err, key) => {
        expect(err).to.not.exist
        const cid = new CID(key)
        wm.add(cid, 1)
        wm.remove(cid)
        wm.remove(cid)

        expect(wm).to.have.length(0)
        done()
      })
    })
  })

  it('entries', (done) => {
    const b = blocks[0]
    b.key((err, key) => {
      expect(err).to.not.exist
      const cid = new CID(key)
      wm.add(cid, 2)

      expect(
        Array.from(wm.entries())
      ).to.be.eql([[
        cid.toBaseEncodedString(),
        new Wantlist.Entry(cid, 2)
      ]])
      done()
    })
  })

  it('sortedEntries', (done) => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    map([
      b1,
      b2
    ],
    (b, cb) => b.key(cb),
    (err, keys) => {
      expect(err).to.not.exist
      const cid1 = new CID(keys[0])
      const cid2 = new CID(keys[1])

      wm.add(cid1, 1)
      wm.add(cid2, 1)

      expect(
        Array.from(wm.sortedEntries())
      ).to.be.eql([
        [cid1.toBaseEncodedString(), new Wantlist.Entry(cid1, 1)],
        [cid2.toBaseEncodedString(), new Wantlist.Entry(cid2, 1)]
      ])
      done()
    })
  })

  it('contains', (done) => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    map([
      b1,
      b2
    ],
    (b, cb) => b.key(cb),
    (err, keys) => {
      expect(err).to.not.exist
      const cid1 = new CID(keys[0])
      const cid2 = new CID(keys[1])

      wm.add(cid1, 2)

      expect(wm.contains(cid1)).to.exist
      expect(wm.contains(cid2)).to.not.exist
      done()
    })
  })

  it('with cidV1', (done) => {
    const b = blocks[0]
    b.key((err, key) => {
      expect(err).to.not.exist
      const cid = new CID(1, 'dag-pb', key)
      wm.add(cid, 2)

      expect(
        Array.from(wm.entries())
      ).to.be.eql([[
        cid.toBaseEncodedString(),
        new Wantlist.Entry(cid, 2)
      ]])
      done()
    })
  })
})
