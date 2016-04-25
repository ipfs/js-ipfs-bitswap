'use strict'

const protobuf = require('protocol-buffers')
const fs = require('fs')
const Block = require('ipfs-blocks').Block
const path = require('path')

const WantlistEntry = require('../wantlist/entry')
const pbm = protobuf(fs.readFileSync(path.join(__dirname, 'message.proto')))

class BitswapMessage {
  constructor (full) {
    this.full = full
    this.wantlist = new Map()
    this.blocks = new Map()
  }

  get empty () {
    return this.blocks.size === 0 && this.wantlist.size === 0
  }

  addEntry (key, priority, cancel) {
    const e = this.wantlist.get(key)

    if (e) {
      e.entry.priority = priority
      e.cancel = Boolean(cancel)
    } else {
      this.wantlist.set(key, {
        entry: new WantlistEntry(key, priority),
        cancel: Boolean(cancel)
      })
    }
  }

  addBlock (block) {
    this.blocks.set(block.key, block)
  }

  toProto () {
    return pbm.Message.encode({
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((e) => {
          return {
            block: String(e.entry.key),
            priority: Number(e.entry.priority),
            cancel: Boolean(e.cancel)
          }
        }),
        full: this.full
      },
      blocks: Array.from(this.blocks.values()).map((b) => b.data)
    })
  }
}

BitswapMessage.fromProto = (raw) => {
  const dec = pbm.Message.decode(raw)
  const m = new BitswapMessage(dec.wantlist.full)

  dec.wantlist.entries.forEach((e) => {
    m.addEntry(e.block, e.priority, e.cancel)
  })
  dec.blocks.forEach((b) => m.addBlock(new Block(b)))

  return m
}

module.exports = BitswapMessage
