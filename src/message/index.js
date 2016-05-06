'use strict'

const protobuf = require('protocol-buffers')
const fs = require('fs')
const Block = require('ipfs-block')
const path = require('path')
const isEqual = require('lodash.isequal')

const pbm = protobuf(fs.readFileSync(path.join(__dirname, 'message.proto')))
const Entry = require('./entry')

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
    const e = this.wantlist.get(key.toString('hex'))

    if (e) {
      e.priority = priority
      e.cancel = Boolean(cancel)
    } else {
      this.wantlist.set(key.toString('hex'), new Entry(key, priority, cancel))
    }
  }

  addBlock (block) {
    this.blocks.set(block.key.toString('hex'), block)
  }

  cancel (key) {
    this.wantlist.delete(key.toString('hex'))
    this.addEntry(key.toString('hex'), 0, true)
  }

  toProto () {
    return pbm.Message.encode({
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((e) => {
          return {
            block: e.key.toString('hex'),
            priority: Number(e.priority),
            cancel: Boolean(e.cancel)
          }
        }),
        full: this.full
      },
      blocks: Array.from(this.blocks.values()).map((b) => b.data)
    })
  }

  equals (other) {
    if (this.full !== other.full ||
        !isEqual(this.wantlist, other.wantlist) ||
        !isEqual(this.blocks, other.blocks)
       ) {
      return false
    }

    return true
  }
}

BitswapMessage.fromProto = (raw) => {
  const dec = pbm.Message.decode(raw)
  const m = new BitswapMessage(dec.wantlist.full)

  dec.wantlist.entries.forEach((e) => {
    m.addEntry(new Buffer(e.block, 'hex'), e.priority, e.cancel)
  })
  dec.blocks.forEach((b) => m.addBlock(new Block(b)))

  return m
}

BitswapMessage.Entry = Entry
module.exports = BitswapMessage
