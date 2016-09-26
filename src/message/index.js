'use strict'

const protobuf = require('protocol-buffers')
const Block = require('ipfs-block')
const isEqualWith = require('lodash.isequalwith')
const mh = require('multihashes')
const assert = require('assert')
const map = require('async/map')

const pbm = protobuf(require('./message.proto'))
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
    assert(Buffer.isBuffer(key), 'key must be a buffer')

    const e = this.wantlist.get(mh.toB58String(key))

    if (e) {
      e.priority = priority
      e.cancel = Boolean(cancel)
    } else {
      this.wantlist.set(mh.toB58String(key), new Entry(key, priority, cancel))
    }
  }

  addBlock (block, cb) {
    block.key((err, key) => {
      if (err) {
        return cb(err)
      }

      this.blocks.set(mh.toB58String(key), block)
      cb()
    })
  }

  cancel (key) {
    this.wantlist.delete(mh.toB58String(key))
    this.addEntry(key, 0, true)
  }

  toProto () {
    const msg = {
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((e) => {
          return {
            block: e.key,
            priority: Number(e.priority),
            cancel: Boolean(e.cancel)
          }
        })
      },
      blocks: Array.from(this.blocks.values())
        .map((b) => b.data)
    }

    if (this.full) {
      msg.wantlist.full = true
    }

    return pbm.Message.encode(msg)
  }

  equals (other) {
    const cmp = (a, b) => {
      if (a.equals && typeof a.equals === 'function') {
        return a.equals(b)
      }
    }

    if (this.full !== other.full ||
        !isEqualWith(this.wantlist, other.wantlist, cmp) ||
        !isEqualWith(this.blocks, other.blocks, cmp)
       ) {
      return false
    }

    return true
  }

  get [Symbol.toStringTag] () {
    const list = Array.from(this.wantlist.keys())
    const blocks = Array.from(this.blocks.keys())
    return `BitswapMessage <full: ${this.full}, list: ${list}, blocks: ${blocks}>`
  }
}

BitswapMessage.fromProto = (raw, callback) => {
  const dec = pbm.Message.decode(raw)
  const m = new BitswapMessage(dec.wantlist.full)

  dec.wantlist.entries.forEach((e) => {
    m.addEntry(e.block, e.priority, e.cancel)
  })

  map(dec.blocks, (b, cb) => m.addBlock(new Block(b), cb), (err) => {
    if (err) {
      return callback(err)
    }
    callback(null, m)
  })
}

BitswapMessage.Entry = Entry
module.exports = BitswapMessage
