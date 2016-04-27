/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const fs = require('fs')
const Block = require('ipfs-block')
const protobuf = require('protocol-buffers')
const path = require('path')
const pbm = protobuf(fs.readFileSync(path.join(__dirname, '../src/message/message.proto')))

const WantlistEntry = require('../src/wantlist/entry')
const BitswapMessage = require('../src/message')

describe('BitswapMessage', () => {
  it('append wanted', () => {
    const str = 'foo'
    const block = new Block(str)
    const m = new BitswapMessage(true)
    m.addEntry(block.key, 1)

    expect(
      pbm.Message.decode(m.toProto()).wantlist.entries[0]
    ).to.be.eql({
      block: block.key.toString(),
      priority: 1,
      cancel: false
    })
  })

  it('encodes blocks', () => {
    const block = new Block('hello')
    const m = new BitswapMessage(true)
    m.addBlock(block)

    expect(
      pbm.Message.decode(m.toProto()).blocks
    ).to.be.eql([
      block.data
    ])
  })

  it('new message fromProto', () => {
    const raw = pbm.Message.encode({
      wantlist: {
        entries: [{
          block: 'hello',
          cancel: false
        }],
        full: true
      },
      blocks: ['hello', 'world']
    })

    const protoMessage = BitswapMessage.fromProto(raw)

    expect(
      protoMessage.full
    ).to.be.eql(
      true
    )
    expect(
      Array.from(protoMessage.wantlist)
    ).to.be.eql([
      ['hello', {cancel: false, entry: new WantlistEntry('hello', 0)}]
    ])

    const b1 = new Block('hello')
    const b2 = new Block('world')
    expect(
      Array.from(protoMessage.blocks)
    ).to.be.eql([
      [b1.key, b1],
      [b2.key, b2]
    ])
  })

  it('duplicates', () => {
    const b = new Block('foo')
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
})
