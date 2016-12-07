'use strict'

const protobuf = require('protocol-buffers')
const Block = require('ipfs-block')
const isEqualWith = require('lodash.isequalwith')
const assert = require('assert')
const map = require('async/map')
const CID = require('cids')

const pbm = protobuf(require('./message.proto'))
const Entry = require('./entry')

class BitswapMessage {
  constructor (full) {
    this.full = full
    this.wantlist = new Map()
    this.blocks = new Map()
  }

  get empty () {
    return this.blocks.size === 0 &&
           this.wantlist.size === 0
  }

  addEntry (cid, priority, cancel) {
    assert(CID.isCID(cid), 'must be a valid cid')
    const cidStr = cid.toBaseEncodedString()

    const entry = this.wantlist.get(cidStr)

    if (entry) {
      entry.priority = priority
      entry.cancel = Boolean(cancel)
    } else {
      this.wantlist.set(cidStr, new Entry(cid, priority, cancel))
    }
  }

  addBlock (cid, block) {
    assert(CID.isCID(cid), 'must be a valid cid')
    const cidStr = cid.toBaseEncodedString()
    this.blocks.set(cidStr, block)
  }

  cancel (cid) {
    assert(CID.isCID(cid), 'must be a valid cid')
    const cidStr = cid.toBaseEncodedString()
    this.wantlist.delete(cidStr)
    this.addEntry(cid, 0, true)
  }

  /*
   * Serializes to Bitswap Message protobuf of
   * version 1.0.0
   */
  serializeToBitswap100 () {
    const msg = {
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((entry) => {
          return {
            block: entry.cid.buffer, // cid
            priority: Number(entry.priority),
            cancel: Boolean(entry.cancel)
          }
        })
      },
      blocks: Array.from(this.blocks.values())
        .map((block) => block.data)
    }

    if (this.full) {
      msg.wantlist.full = true
    }

    return pbm.Message.encode(msg)
  }

  /*
   * Serializes to Bitswap Message protobuf of
   * version 1.1.0
   */
  serializeToBitswap110 () {
    // TODO
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

BitswapMessage.deserialize = (raw, callback) => {
  const decoded = pbm.Message.decode(raw)
  const msg = new BitswapMessage(decoded.wantlist.full)

  decoded.wantlist.entries.forEach((entry) => {
    // note: entry.block is the CID here
    const cid = new CID(entry.block)
    msg.addEntry(cid, entry.priority, entry.cancel)
  })

  // decoded.blocks are just the byte arrays
  map(decoded.blocks, (b, cb) => {
    const block = new Block(b)
    block.key((err, key) => {
      if (err) {
        return cb(err)
      }
      const cid = new CID(key)
      msg.addBlock(cid, block)
      cb()
    })
  }, (err) => {
    if (err) {
      return callback(err)
    }
    callback(null, msg)
  })
}

BitswapMessage.Entry = Entry
module.exports = BitswapMessage
