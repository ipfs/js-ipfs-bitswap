/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const fs = require('fs')
const Block = require('ipfs-blocks').Block
const protobuf = require('protocol-buffers')
const path = require('path')
const pbm = protobuf(fs.readFileSync(path.join(__dirname, '../src/message/message.proto')))

const BitswapMessage = require('../src/message')

describe.only('BitswapMessage', () => {
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
      ['hello', {entry: {key: 'hello', priority: 0}, cancel: false}]
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
    const msg = new BitswapMessage(true)

    msg.addEntry(b.key, 1)
    msg.addEntry(b.key, 1)

    expect(msg.wantlist.size).to.be.eql(1)

    msg.addBlock(b)
    msg.addBlock(b)

    expect(msg.blocks.size).to.be.eql(1)
  })
})
