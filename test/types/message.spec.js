/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Block = require('ipfs-block')
const protobuf = require('protocol-buffers')
const map = require('async/map')
const pbm = protobuf(require('../../src/types/message/message.proto'))
const CID = require('cids')

const loadFixture = require('aegir/fixtures')
const testDataPath = '../test-data/serialized-from-go'
const rawMessageFullWantlist = loadFixture(__dirname, testDataPath + '/bitswap110-message-full-wantlist')
const rawMessageOneBlock = loadFixture(__dirname, testDataPath + '/bitswap110-message-one-block')

const BitswapMessage = require('../../src/types/message')

describe('BitswapMessage', () => {
  let blocks
  let cids

  before((done) => {
    const data = ['foo', 'hello', 'world']
    blocks = data.map((d) => new Block(d))
    map(blocks, (b, cb) => b.key(cb), (err, keys) => {
      if (err) {
        return done(err)
      }
      cids = keys.map((key) => new CID(key))
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

  it('.serializeToBitswap100', (done) => {
    const block = blocks[1]
    const cid = cids[1]
    const m = new BitswapMessage(true)
    m.addBlock(cid, block)
    expect(pbm.Message.decode(m.serializeToBitswap100()).blocks)
      .to.be.eql([block.data])
    done()
  })

  it.skip('.serializeToBitswap110', (done) => {})

  it('.deserialize a Bitswap100 Message', (done) => {
    const cid = cids[0]
    const raw = pbm.Message.encode({
      wantlist: {
        entries: [{
          block: cid.buffer,
          cancel: false
        }],
        full: true
      },
      blocks: [
        new Buffer('hello'),
        new Buffer('world')
      ]
    })

    BitswapMessage.deserialize(raw, (err, protoMessage) => {
      expect(err).to.not.exist
      expect(protoMessage.full).to.equal(true)
      expect(Array.from(protoMessage.wantlist))
        .to.be.eql([[
          cid.toBaseEncodedString(),
          new BitswapMessage.Entry(cid, 0, false)
        ]])

      const b1 = blocks[1]
      const b2 = blocks[2]
      const cid1 = cids[1]
      const cid2 = cids[2]

      expect(Array.from(protoMessage.blocks).map((b) => [b[0], b[1].data]))
        .to.eql([
          [cid1.toBaseEncodedString(), b1.data],
          [cid2.toBaseEncodedString(), b2.data]
        ])

      done()
    })
  })

  it.skip('.deserialize a Bitswap100 Message', (done) => {})

  it('duplicates', (done) => {
    const b = blocks[0]
    const cid = cids[0]
    const m = new BitswapMessage(true)

    m.addEntry(cid, 1)
    m.addEntry(cid, 1)

    expect(m.wantlist.size).to.be.eql(1)
    m.addBlock(cid, b)
    m.addBlock(cid, b)
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

      m1.addBlock(cid, b)
      m2.addBlock(cid, b)
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

      m1.addBlock(cid, b)
      m2.addBlock(cid, b)
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
      const goEncoded = new Buffer('CioKKAoiEiAs8k26X7CjDiboOyrFueKeGxYeXB+nQl5zBDNik4uYJBAKGAA=', 'base64')

      const msg = new BitswapMessage(false)
      const cid = new CID('QmRN6wdp1S2A5EtjW9A3M1vKSBuQQGcgvuhoMUoEz4iiT5')
      msg.addEntry(cid, 10)

      BitswapMessage.deserialize(goEncoded, (err, res) => {
        expect(err).to.not.exist
        expect(res).to.eql(msg)
        expect(msg.serializeToBitswap100()).to.eql(goEncoded)
        done()
      })
    })

    describe('bitswap 1.1.0 message', () => {
      it('full wantlist message', (done) => {
        BitswapMessage.deserialize(rawMessageFullWantlist, (err, message) => {
          expect(err).to.not.exist
          done()
        })
      })

      it('one block message', (done) => {
        BitswapMessage.deserialize(rawMessageOneBlock, (err, message) => {
          expect(err).to.not.exist
          done()
        })
      })
    })
  })
})
