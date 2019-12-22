'use strict'

const protons = require('protons')
const Block = require('ipfs-block')
const CID = require('cids')
const { getName } = require('multicodec')
const vd = require('varint-decoder')
const multihashing = require('multihashing-async')
const { isMapEqual } = require('../../utils')
const pbm = protons(require('./message.proto'))
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
    const cidStr = cid.toString('base58btc')

    const entry = this.wantlist.get(cidStr)

    if (entry) {
      entry.priority = priority
      entry.cancel = Boolean(cancel)
    } else {
      this.wantlist.set(cidStr, new Entry(cid, priority, cancel))
    }
  }

  addBlock (block) {
    const cidStr = block.cid.toString('base58btc')
    this.blocks.set(cidStr, block)
  }

  cancel (cid) {
    const cidStr = cid.toString('base58btc')
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
      payload: []
    }

    if (this.full) {
      msg.wantlist.full = true
    }

    this.blocks.forEach((block) => {
      msg.payload.push({
        prefix: block.cid.prefix,
        data: block.data
      })
    })

    return pbm.Message.encode(msg)
  }

  equals (other) {
    if (this.full !== other.full ||
        !isMapEqual(this.wantlist, other.wantlist) ||
        !isMapEqual(this.blocks, other.blocks)
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

BitswapMessage.deserialize = async (raw) => {
  const decoded = pbm.Message.decode(raw)

  const isFull = (decoded.wantlist && decoded.wantlist.full) || false
  const msg = new BitswapMessage(isFull)

  if (decoded.wantlist) {
    decoded.wantlist.entries.forEach((entry) => {
      // note: entry.block is the CID here
      const cid = new CID(entry.block)
      msg.addEntry(cid, entry.priority, entry.cancel)
    })
  }

  // Bitswap 1.0.0
  // decoded.blocks are just the byte arrays
  if (decoded.blocks.length > 0) {
    await Promise.all(decoded.blocks.map(async (b) => {
      const hash = await multihashing(b, 'sha2-256')
      const cid = new CID(hash)
      msg.addBlock(new Block(b, cid))
    }))
    return msg
  }

  // Bitswap 1.1.0
  if (decoded.payload.length > 0) {
    await Promise.all(decoded.payload.map(async (p) => {
      if (!p.prefix || !p.data) {
        return
      }
      const values = vd(p.prefix)
      const cidVersion = values[0]
      const multicodec = values[1]
      const hashAlg = values[2]
      // const hashLen = values[3] // We haven't need to use this so far
      const hash = await multihashing(p.data, hashAlg)
      const cid = new CID(cidVersion, getName(multicodec), hash)
      msg.addBlock(new Block(p.data, cid))
    }))
    return msg
  }

  return msg
}

BitswapMessage.Entry = Entry
module.exports = BitswapMessage
