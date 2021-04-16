'use strict'

const IPLDBlock = require('ipld-block')
const CID = require('cids')
const { getName } = require('multicodec')
// @ts-ignore
const vd = require('varint-decoder')
const multihashing = require('multihashing-async')
const { isMapEqual } = require('../../utils')
const { Message } = require('./message')
const Entry = require('./entry')

class BitswapMessage {
  /**
   * @param {boolean} full
   */
  constructor (full) {
    this.full = full
    /** @type {Map<string, Entry>} */
    this.wantlist = new Map()

    /** @type {Map<string, import('ipld-block')>} */
    this.blocks = new Map()

    /** @type {Map<string, import('./message').Message.BlockPresenceType>} */
    this.blockPresences = new Map()
    this.pendingBytes = 0
  }

  get empty () {
    return this.blocks.size === 0 &&
           this.wantlist.size === 0 &&
           this.blockPresences.size === 0
  }

  /**
   *
   * @param {CID} cid
   * @param {number} priority
   * @param {import('./message').Message.Wantlist.WantType | null} [wantType]
   * @param {boolean} [cancel]
   * @param {boolean} [sendDontHave]
   * @returns {void}
   */
  addEntry (cid, priority, wantType, cancel, sendDontHave) {
    if (wantType == null) {
      wantType = BitswapMessage.WantType.Block
    }

    const cidStr = cid.toString('base58btc')
    const entry = this.wantlist.get(cidStr)
    if (entry) {
      // Only change priority if want is of the same type
      if (entry.wantType === wantType) {
        entry.priority = priority
      }
      // Only change from "dont cancel" to "do cancel"
      if (cancel) {
        entry.cancel = Boolean(cancel)
      }
      // Only change from "dont send" to "do send" DONT_HAVE
      if (sendDontHave) {
        entry.sendDontHave = Boolean(sendDontHave)
      }
      // want-block overrides existing want-have
      if (wantType === BitswapMessage.WantType.Block && entry.wantType === BitswapMessage.WantType.Have) {
        entry.wantType = wantType
      }
    } else {
      this.wantlist.set(cidStr, new Entry(cid, priority, wantType, cancel, sendDontHave))
    }
  }

  /**
   * @param {import('ipld-block')} block
   * @returns {void}
   */
  addBlock (block) {
    const cidStr = block.cid.toString('base58btc')
    this.blocks.set(cidStr, block)
  }

  /**
   * @param {CID} cid
   */
  addHave (cid) {
    const cidStr = cid.toString('base58btc')
    if (!this.blockPresences.has(cidStr)) {
      this.blockPresences.set(cidStr, BitswapMessage.BlockPresenceType.Have)
    }
  }

  /**
   * @param {CID} cid
   */
  addDontHave (cid) {
    const cidStr = cid.toString('base58btc')
    if (!this.blockPresences.has(cidStr)) {
      this.blockPresences.set(cidStr, BitswapMessage.BlockPresenceType.DontHave)
    }
  }

  /**
   * @param {CID} cid
   */
  cancel (cid) {
    const cidStr = cid.toString('base58btc')
    this.wantlist.delete(cidStr)
    this.addEntry(cid, 0, BitswapMessage.WantType.Block, true, false)
  }

  /**
   * @param {number} size
   */
  setPendingBytes (size) {
    this.pendingBytes = size
  }

  /**
   * Serializes to Bitswap Message protobuf of
   * version 1.0.0
   *
   * @returns {Uint8Array}
   */
  serializeToBitswap100 () {
    const msg = {
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((entry) => {
          return {
            block: entry.cid.bytes, // cid
            priority: Number(entry.priority),
            cancel: Boolean(entry.cancel)
          }
        }),
        full: this.full ? true : undefined
      },
      blocks: Array.from(this.blocks.values())
        .map((block) => block.data)
    }

    return Message.encode(msg).finish()
  }

  /**
   * Serializes to Bitswap Message protobuf of
   * version 1.1.0
   *
   * @returns {Uint8Array}
   */
  serializeToBitswap110 () {
    const msg = {
      wantlist: {
        entries: Array.from(this.wantlist.values()).map((entry) => {
          return {
            block: entry.cid.bytes, // cid
            priority: Number(entry.priority),
            wantType: entry.wantType,
            cancel: Boolean(entry.cancel),
            sendDontHave: Boolean(entry.sendDontHave)
          }
        }),
        full: this.full ? true : undefined
      },
      /** @type {import('./message').Message.BlockPresence[]} */
      blockPresences: [],

      /** @type {{ prefix: Uint8Array, data: Uint8Array }[]} */
      payload: [],
      pendingBytes: this.pendingBytes
    }

    this.blocks.forEach((block) => {
      msg.payload.push(
        new Message.Block({
          prefix: block.cid.prefix,
          data: block.data
        })
      )
    })

    for (const [cidStr, bpType] of this.blockPresences) {
      msg.blockPresences.push(new Message.BlockPresence({
        cid: new CID(cidStr).bytes,
        type: bpType
      }))
    }

    if (this.pendingBytes > 0) {
      msg.pendingBytes = this.pendingBytes
    }

    return Message.encode(msg).finish()
  }

  /**
   * @param {BitswapMessage} other
   * @returns {boolean}
   */
  equals (other) {
    if (this.full !== other.full ||
        this.pendingBytes !== other.pendingBytes ||
        !isMapEqual(this.wantlist, other.wantlist) ||
        !isMapEqual(this.blocks, other.blocks) ||
        // @TODO - Is this a bug ?
        // @ts-expect-error - isMap equals map values to be objects not numbers
        !isMapEqual(this.blockPresences, other.blockPresences)
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

/**
 * @param {Uint8Array} raw
 */
BitswapMessage.deserialize = async (raw) => {
  const decoded = Message.decode(raw)

  const isFull = (decoded.wantlist && decoded.wantlist.full) || false
  const msg = new BitswapMessage(isFull)

  if (decoded.wantlist && decoded.wantlist.entries) {
    decoded.wantlist.entries.forEach((entry) => {
      if (!entry.block) {
        return
      }
      // note: entry.block is the CID here
      const cid = new CID(entry.block)
      msg.addEntry(cid, entry.priority || 0, entry.wantType, Boolean(entry.cancel), Boolean(entry.sendDontHave))
    })
  }

  if (decoded.blockPresences) {
    decoded.blockPresences.forEach((blockPresence) => {
      if (!blockPresence.cid) {
        return
      }

      const cid = new CID(blockPresence.cid)

      if (blockPresence.type === BitswapMessage.BlockPresenceType.Have) {
        msg.addHave(cid)
      } else {
        msg.addDontHave(cid)
      }
    })
  }

  // Bitswap 1.0.0
  // decoded.blocks are just the byte arrays
  if (decoded.blocks.length > 0) {
    await Promise.all(decoded.blocks.map(async (b) => {
      const hash = await multihashing(b, 'sha2-256')
      const cid = new CID(hash)
      msg.addBlock(new IPLDBlock(b, cid))
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
      msg.addBlock(new IPLDBlock(p.data, cid))
    }))
    msg.setPendingBytes(decoded.pendingBytes)
    return msg
  }

  return msg
}

/**
 * @param {CID} cid
 */
BitswapMessage.blockPresenceSize = (cid) => {
  // It's ok if this is not exactly right: it's used to estimate the size of
  // the HAVE / DONT_HAVE on the wire, but when doing that calculation we leave
  // plenty of padding under the maximum message size.
  // (It's more important for this to be fast).
  return cid.bytes.length + 1
}

BitswapMessage.Entry = Entry
BitswapMessage.WantType = {
  Block: Message.Wantlist.WantType.Block,
  Have: Message.Wantlist.WantType.Have
}
BitswapMessage.BlockPresenceType = {
  Have: Message.BlockPresenceType.Have,
  DontHave: Message.BlockPresenceType.DontHave
}
module.exports = BitswapMessage
