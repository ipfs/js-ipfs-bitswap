/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const { CID } = require('multiformats')
const { sha256 } = require('multiformats/hashes/sha2')
const { base58btc } = require('multiformats/bases/base58')
const { base64 } = require('multiformats/bases/base64')

const Wantlist = require('../../src/types/wantlist')
const Message = require('../../src/types/message')
const makeBlock = require('../utils/make-blocks')

const DAG_PB_CODEC = 0x70

describe('Wantlist', () => {
  /** @type {Wantlist} */
  let wm
  /** @type {{ cid: CID, data: Uint8Array }[]} */
  let blocks

  before(async () => {
    blocks = await makeBlock(2)
  })

  beforeEach(() => {
    wm = new Wantlist()
  })

  it('length', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 2, Message.WantType.Block)
    wm.add(b2.cid, 1, Message.WantType.Block)
    expect(wm).to.have.length(2)
  })

  describe('remove', () => {
    it('removes with a single ref', () => {
      const b = blocks[0]

      wm.add(b.cid, 1, Message.WantType.Block)
      wm.remove(b.cid)
      expect(wm).to.have.length(0)
    })

    it('removes with multiple refs', () => {
      const b1 = blocks[0]
      const b2 = blocks[1]

      wm.add(b1.cid, 1, Message.WantType.Block)
      wm.add(b2.cid, 2, Message.WantType.Block)

      expect(wm).to.have.length(2)

      wm.remove(b2.cid)

      expect(wm).to.have.length(1)

      wm.add(b1.cid, 2, Message.WantType.Block)
      wm.remove(b1.cid)

      expect(wm).to.have.length(1)

      wm.remove(b1.cid)
      expect(wm).to.have.length(0)
    })

    it('ignores non existing removes', () => {
      const b = blocks[0]

      wm.add(b.cid, 1, Message.WantType.Block)
      wm.remove(b.cid)
      wm.remove(b.cid)

      expect(wm).to.have.length(0)
    })
  })

  it('entries', () => {
    const b = blocks[0]

    wm.add(b.cid, 2, Message.WantType.Have)
    expect(
      Array.from(wm.entries())
    ).to.be.eql([[
      b.cid.toString(base58btc),
      new Wantlist.Entry(b.cid, 2, Message.WantType.Have)
    ]])
  })

  it('sortedEntries', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 1, Message.WantType.Block)
    wm.add(b2.cid, 1, Message.WantType.Block)

    expect(
      Array.from(wm.sortedEntries())
    ).to.be.eql([
      [b1.cid.toString(base58btc), new Wantlist.Entry(b1.cid, 1, Message.WantType.Block)],
      [b2.cid.toString(base58btc), new Wantlist.Entry(b2.cid, 1, Message.WantType.Block)]
    ])
  })

  it('contains', () => {
    const b1 = blocks[0]
    const b2 = blocks[1]

    wm.add(b1.cid, 2, Message.WantType.Block)

    expect(wm.contains(b1.cid)).to.be.true()
    expect(wm.contains(b2.cid)).to.be.false()
  })

  it('with cidV1', async () => {
    const b = blocks[0]
    const digest = await sha256.digest(b.data)

    const cid = CID.createV1(DAG_PB_CODEC, digest)
    wm.add(cid, 2, Message.WantType.Block)

    expect(
      Array.from(wm.entries())
    ).to.be.eql([[
      cid.toString(base58btc),
      new Wantlist.Entry(cid, 2, Message.WantType.Block)
    ]])
  })

  it('matches same cid derived from distinct encodings', () => {
    // Base 64
    const id1 = 'mAVUSIKlIkE8vD0ebj4GXaUswGEsNLtHBzSoewPuF0pmhkqRH'
    // Base 32
    const id2 = 'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'

    const cid1 = CID.parse(id1, base64)
    const cid2 = CID.parse(id2)
    wm.add(cid1, 2, Message.WantType.Block)
    expect(wm.contains(cid1)).to.be.true()
    expect(wm.contains(cid2)).to.be.true()

    wm.remove(cid1)
    expect(wm.contains(cid1)).to.be.false()
    expect(wm.contains(cid2)).to.be.false()
  })
})
