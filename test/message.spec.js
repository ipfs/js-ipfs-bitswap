/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const map = require('async/map')
const Block = require('ipfs-block')
const protobuf = require('protocol-buffers')
const mh = require('multihashes')
const pbm = protobuf(require('../src/message/message.proto'))

const BitswapMessage = require('../src/message')

describe('BitswapMessage', () => {
  let blocks

  before((done) => {
    map([
      'foo',
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

  it('go interop', (done) => {
    const goEncoded = new Buffer('CioKKAoiEiAs8k26X7CjDiboOyrFueKeGxYeXB+nQl5zBDNik4uYJBAKGAA=', 'base64')

    const m = new BitswapMessage(false)
    m.addEntry(mh.fromB58String('QmRN6wdp1S2A5EtjW9A3M1vKSBuQQGcgvuhoMUoEz4iiT5'), 10)

    BitswapMessage.fromProto(goEncoded, (err, res) => {
      expect(err).to.not.exist
      expect(res).to.be.eql(m)

      expect(
        m.toProto()
      ).to.be.eql(
        goEncoded
      )
      done()
    })
  })

  it('append wanted', () => {
    const block = blocks[0]
    const m = new BitswapMessage(true)
    m.addEntry(block.key, 1)

    expect(
      pbm.Message.decode(m.toProto()).wantlist.entries[0]
    ).to.be.eql({
      block: block.key,
      priority: 1,
      cancel: false
    })
  })

  it('encodes blocks', () => {
    const block = blocks[1]
    const m = new BitswapMessage(true)
    m.addBlock(block)

    expect(
      pbm.Message.decode(m.toProto()).blocks
    ).to.be.eql([
      block.data
    ])
  })

  it('new message fromProto', (done) => {
    const raw = pbm.Message.encode({
      wantlist: {
        entries: [{
          block: new Buffer('hello'),
          cancel: false
        }],
        full: true
      },
      blocks: ['hello', 'world']
    })

    BitswapMessage.fromProto(raw, (err, protoMessage) => {
      expect(err).to.not.exist
      expect(
        protoMessage.full
      ).to.be.eql(
        true
      )
      expect(
        Array.from(protoMessage.wantlist)
      ).to.be.eql([
        [mh.toB58String(new Buffer('hello')), new BitswapMessage.Entry(new Buffer('hello'), 0, false)]
      ])

      const b1 = blocks[1]
      const b2 = blocks[2]
      expect(
        Array.from(protoMessage.blocks)
      ).to.be.eql([
        [mh.toB58String(b1.key), b1],
        [mh.toB58String(b2.key), b2]
      ])

      done()
    })
  })

  it('duplicates', () => {
    const b = blocks[0]
    const m = new BitswapMessage(true)

    m.addEntry(b.key, 1)
    m.addEntry(b.key, 1)

    expect(m.wantlist.size).to.be.eql(1)

    m.addBlock(b)
    m.addBlock(b)

    expect(m.blocks.size).to.be.eql(1)
  })

  it('empty', () => {
    const m = new BitswapMessage(true)

    expect(
      m.empty
    ).to.be.eql(
      true
    )
  })

  it('non full message', () => {
    const m = new BitswapMessage(false)

    expect(
      pbm.Message.decode(m.toProto()).wantlist.full
    ).to.be.eql(
      false
    )
  })

  describe('.equals', () => {
    it('true, same message', () => {
      const b = blocks[0]
      const m1 = new BitswapMessage(true)
      const m2 = new BitswapMessage(true)

      m1.addEntry(b.key, 1)
      m1.addBlock(b)
      m2.addEntry(b.key, 1)
      m2.addBlock(b)

      expect(m1.equals(m2)).to.be.eql(true)
    })

    it('false, different entries', () => {
      const b = blocks[0]
      const m1 = new BitswapMessage(true)
      const m2 = new BitswapMessage(true)

      m1.addEntry(b.key, 1)
      m1.addBlock(b)
      m2.addEntry(b.key, 2)
      m2.addBlock(b)

      expect(m1.equals(m2)).to.be.eql(false)
    })
  })

  describe('Entry', () => {
    it('exposes the wantlist entry properties', () => {
      const entry = new BitswapMessage.Entry(new Buffer('hello'), 5, false)

      expect(entry).to.have.property('key')
      expect(entry).to.have.property('priority', 5)

      expect(entry).to.have.property('cancel', false)
    })

    it('allows setting properties on the wantlist entry', () => {
      const entry = new BitswapMessage.Entry(new Buffer('hello'), 5, false)

      expect(entry.entry).to.have.property('key')
      expect(entry.entry).to.have.property('priority', 5)

      entry.key = new Buffer('world')
      entry.priority = 2

      expect(entry.entry).to.have.property('key')
      expect(entry.entry.key.equals(new Buffer('world')))
      expect(entry.entry).to.have.property('priority', 2)
    })
  })
})
