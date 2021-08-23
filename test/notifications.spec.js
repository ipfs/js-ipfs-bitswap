/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const { CID } = require('multiformats')
const { base32 } = require('multiformats/bases/base32')
const { AbortController } = require('native-abort-controller')
const { toString: uint8ArrayToString } = require('uint8arrays/to-string')

const Notifications = require('../src/notifications')

const makeBlocks = require('./utils/make-blocks')
const { makePeerId } = require('./utils/make-peer-id')

describe('Notifications', () => {
  /** @type {{ cid: CID, data: Uint8Array }[]} */
  let blocks
  /** @type {import('peer-id')} */
  let peerId

  before(async () => {
    blocks = await makeBlocks(3)
    peerId = await makePeerId()
  })

  it('hasBlock', (done) => {
    const n = new Notifications(peerId)
    const b = blocks[0]
    n.once(`block:${uint8ArrayToString(b.cid.multihash.bytes, 'base64')}`, (block) => {
      expect(b.data).to.equalBytes(block)
      done()
    })
    n.hasBlock(b.cid, b.data)
  })

  describe('wantBlock', () => {
    it('receive block', async () => {
      const n = new Notifications(peerId)
      const b = blocks[0]

      const p = n.wantBlock(b.cid)

      // check that listeners have been set up
      expect(n.listenerCount(`block:${uint8ArrayToString(b.cid.multihash.bytes, 'base64')}`)).to.equal(1)
      expect(n.listenerCount(`unwant:${uint8ArrayToString(b.cid.multihash.bytes, 'base64')}`)).to.equal(1)

      n.hasBlock(b.cid, b.data)

      const block = await p

      expect(b.data).to.equalBytes(block)

      // check that internal cleanup works as expected
      expect(n.listenerCount(`block:${uint8ArrayToString(b.cid.multihash.bytes, 'base64')}`)).to.equal(0)
      expect(n.listenerCount(`unwant:${uint8ArrayToString(b.cid.multihash.bytes, 'base64')}`)).to.equal(0)
    })

    it('unwant block', async () => {
      const n = new Notifications(peerId)
      const b = blocks[0]

      const p = n.wantBlock(b.cid)

      n.unwantBlock(b.cid)

      await expect(p).to.eventually.be.rejectedWith(/unwanted/)
    })

    it('abort block want', async () => {
      const n = new Notifications(peerId)
      const b = blocks[0]

      const controller = new AbortController()

      const p = n.wantBlock(b.cid, {
        signal: controller.signal
      })

      controller.abort()

      await expect(p).to.eventually.be.rejectedWith(/aborted/)
    })
  })

  describe('wantBlock with same cid derived from distinct encodings', () => {
    it('receive block', async () => {
      const n = new Notifications(peerId)
      const cid = CID.parse(blocks[0].cid.toV1().toString())

      const cid2 = CID.parse(cid.toString(base32))
      const p = n.wantBlock(cid2)

      // check that listeners have been set up
      expect(n.listenerCount(`block:${uint8ArrayToString(cid2.multihash.bytes, 'base64')}`)).to.equal(1)
      expect(n.listenerCount(`unwant:${uint8ArrayToString(cid2.multihash.bytes, 'base64')}`)).to.equal(1)

      n.hasBlock(cid, blocks[0].data)

      await expect(p).to.eventually.deep.equal(blocks[0].data)

      // check that internal cleanup works as expected
      expect(n.listenerCount(`block:${uint8ArrayToString(cid2.multihash.bytes, 'base64')}`)).to.equal(0)
      expect(n.listenerCount(`unwant:${uint8ArrayToString(cid2.multihash.bytes, 'base64')}`)).to.equal(0)
    })

    it('unwant block', async () => {
      const n = new Notifications(peerId)
      const cid = CID.parse(blocks[0].cid.toV1().toString())

      const cid2 = CID.parse(cid.toString(base32))
      const p = n.wantBlock(cid2)

      n.unwantBlock(cid)

      await expect(p).to.eventually.be.rejectedWith(/unwanted/)
    })
  })
})
