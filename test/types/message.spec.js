/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const protons = require('protons')
const map = require('async/map')
const CID = require('cids')
const isNode = require('detect-node')
const _ = require('lodash')
const Buffer = require('safe-buffer').Buffer
const loadFixture = require('aegir/fixtures')
const testDataPath = (isNode ? '../' : '') + 'fixtures/serialized-from-go'
const rawMessageFullWantlist = loadFixture(__dirname, testDataPath + '/bitswap110-message-full-wantlist')
const rawMessageOneBlock = loadFixture(__dirname, testDataPath + '/bitswap110-message-one-block')

const pbm = protons(require('../../src/types/message/message.proto'))

const BitswapMessage = require('../../src/types/message')
const makeBlock = require('../utils/make-block')

describe('BitswapMessage', () => {
  let blocks
  let cids

  before((done) => {
    map(_.range(3), (i, cb) => makeBlock(cb), (err, res) => {
      expect(err).to.not.exist()
      blocks = res
      cids = blocks.map((b) => b.cid)
      done()
    })
  })

  it('.addEntry - want block', () => {
    const cid = cids[1]
    const msg = new BitswapMessage(true)
    msg.addEntry(cid, 1)
    const serialized = msg.serializeToBitswap100()

    expect(pbm.Message.decode(serialized).wantlist.entries[0]).to.be.eql({
      block: cid.buffer,
      priority: 1,
      cancel: false
    })
  })

  it('.serializeToBitswap100', () => {
    const block = blocks[1]
    const msg = new BitswapMessage(true)
    msg.addBlock(block)
    const serialized = msg.serializeToBitswap100()
    expect(pbm.Message.decode(serialized).blocks).to.eql([block.data])
  })

  it('.serializeToBitswap110', () => {
    const block = blocks[1]
    const msg = new BitswapMessage(true)
    msg.addBlock(block)

    const serialized = msg.serializeToBitswap110()
    const decoded = pbm.Message.decode(serialized)

    expect(decoded.payload[0].data).to.eql(block.data)
  })

  it('.deserialize a Bitswap100 Message', (done) => {
    const cid0 = cids[0]
    const cid1 = cids[1]
    const cid2 = cids[2]

    const b1 = blocks[1]
    const b2 = blocks[2]

    const raw = pbm.Message.encode({
      wantlist: {
        entries: [{
          block: cid0.buffer,
          cancel: false
        }],
        full: true
      },
      blocks: [
        b1.data,
        b2.data
      ]
    })

    BitswapMessage.deserialize(raw, (err, msg) => {
      expect(err).to.not.exist()
      expect(msg.full).to.equal(true)
      expect(Array.from(msg.wantlist))
        .to.eql([[
          cid0.buffer.toString(),
          new BitswapMessage.Entry(cid0, 0, false)
        ]])

      expect(
        Array.from(msg.blocks).map((b) => [b[0], b[1].data])
      ).to.eql([
        [cid1.buffer.toString(), b1.data],
        [cid2.buffer.toString(), b2.data]
      ])

      done()
    })
  })

  it('.deserialize a Bitswap110 Message', (done) => {
    const cid0 = cids[0]
    const cid1 = cids[1]
    const cid2 = cids[2]

    const b1 = blocks[1]
    const b2 = blocks[2]

    const raw = pbm.Message.encode({
      wantlist: {
        entries: [{
          block: cid0.buffer,
          cancel: false
        }],
        full: true
      },
      payload: [{
        data: b1.data,
        prefix: cid1.prefix
      }, {
        data: b2.data,
        prefix: cid2.prefix
      }]
    })

    BitswapMessage.deserialize(raw, (err, msg) => {
      expect(err).to.not.exist()
      expect(msg.full).to.equal(true)
      expect(Array.from(msg.wantlist))
        .to.eql([[
          cid0.buffer.toString(),
          new BitswapMessage.Entry(cid0, 0, false)
        ]])

      expect(
        Array.from(msg.blocks).map((b) => [b[0], b[1].data])
      ).to.eql([
        [cid1.buffer.toString(), b1.data],
        [cid2.buffer.toString(), b2.data]
      ])

      done()
    })
  })

  it('duplicates', (done) => {
    const b = blocks[0]
    const cid = cids[0]
    const m = new BitswapMessage(true)

    m.addEntry(cid, 1)
    m.addEntry(cid, 1)

    expect(m.wantlist.size).to.be.eql(1)
    m.addBlock(b)
    m.addBlock(b)
    expect(m.blocks.size).to.be.eql(1)
    done()
  })

  it('.empty', () => {
    const m = new BitswapMessage(true)
    expect(m.empty).to.equal(true)
  })

  it('non full wantlist message', () => {
    const msg = new BitswapMessage(false)
    const serialized = msg.serializeToBitswap100()

    expect(pbm.Message.decode(serialized).wantlist.full).to.equal(false)
  })

  describe('.equals', () => {
    it('true, same message', (done) => {
      const b = blocks[0]
      const cid = cids[0]
      const m1 = new BitswapMessage(true)
      const m2 = new BitswapMessage(true)

      m1.addEntry(cid, 1)
      m2.addEntry(cid, 1)

      m1.addBlock(b)
      m2.addBlock(b)
      expect(m1.equals(m2)).to.equal(true)
      done()
    })

    it('false, different entries', (done) => {
      const b = blocks[0]
      const cid = cids[0]
      const m1 = new BitswapMessage(true)
      const m2 = new BitswapMessage(true)

      m1.addEntry(cid, 100)
      m2.addEntry(cid, 3750)

      m1.addBlock(b)
      m2.addBlock(b)
      expect(m1.equals(m2)).to.equal(false)
      done()
    })
  })

  describe('BitswapMessageEntry', () => {
    it('exposes the wantlist entry properties', () => {
      const cid = cids[0]
      const entry = new BitswapMessage.Entry(cid, 5, false)

      expect(entry).to.have.property('cid')
      expect(entry).to.have.property('priority', 5)

      expect(entry).to.have.property('cancel', false)
    })

    it('allows setting properties on the wantlist entry', () => {
      const cid1 = cids[0]
      const cid2 = cids[1]

      const entry = new BitswapMessage.Entry(cid1, 5, false)

      expect(entry.entry).to.have.property('cid')
      expect(entry.entry).to.have.property('priority', 5)

      entry.cid = cid2
      entry.priority = 2

      expect(entry.entry).to.have.property('cid')
      expect(entry.entry.cid.equals(cid2))
      expect(entry.entry).to.have.property('priority', 2)
    })
  })

  describe('go interop', () => {
    it('bitswap 1.0.0 message', (done) => {
      const goEncoded = Buffer.from('CioKKAoiEiAs8k26X7CjDiboOyrFueKeGxYeXB+nQl5zBDNik4uYJBAKGAA=', 'base64')

      const msg = new BitswapMessage(false)
      const cid = new CID('QmRN6wdp1S2A5EtjW9A3M1vKSBuQQGcgvuhoMUoEz4iiT5')
      msg.addEntry(cid, 10)

      BitswapMessage.deserialize(goEncoded, (err, res) => {
        expect(err).to.not.exist()
        expect(res).to.eql(msg)
        expect(msg.serializeToBitswap100()).to.eql(goEncoded)
        done()
      })
    })

    describe.skip('bitswap 1.1.0 message', () => {
      // TODO check with whyrusleeping the quality of the raw protobufs
      // deserialization is just failing on the first and the second has a
      // payload but empty
      it('full wantlist message', (done) => {
        BitswapMessage.deserialize(rawMessageFullWantlist, (err, message) => {
          expect(err).to.not.exist()
          // TODO
          //   check the deserialised message
          expect(message.serializeToBitswap110()).to.eql(rawMessageFullWantlist)
          done()
        })
      })

      it('one block message', (done) => {
        BitswapMessage.deserialize(rawMessageOneBlock, (err, message) => {
          expect(err).to.not.exist()
          // TODO
          //   check the deserialised message
          expect(message.serializeToBitswap110()).to.eql(rawMessageOneBlock)
          done()
        })
      })
    })
  })
})
