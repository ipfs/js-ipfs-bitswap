/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const CID = require('cids')
const Block = require('ipld-block')
const AbortController = require('abort-controller')

const Notifications = require('../src/notifications')

const makeBlock = require('./utils/make-block')
const makePeerId = require('./utils/make-peer-id')

describe('Notifications', () => {
  let blocks
  let peerId

  before(async () => {
    blocks = await makeBlock(3)
    peerId = await makePeerId()
  })

  it('hasBlock', (done) => {
    const n = new Notifications(peerId)
    const b = blocks[0]
    n.once(`block:${b.cid.multihash.toString('base64')}`, (block) => {
      expect(b).to.eql(block)
      done()
    })
    n.hasBlock(b)
  })

  describe('wantBlock', () => {
    it('receive block', async () => {
      const n = new Notifications(peerId)
      const b = blocks[0]

      const p = n.wantBlock(b.cid)

      // check that listeners have been set up
      expect(n.listenerCount(`block:${b.cid.multihash.toString('base64')}`)).to.equal(1)
      expect(n.listenerCount(`unwant:${b.cid.multihash.toString('base64')}`)).to.equal(1)

      n.hasBlock(b)

      const block = await p

      expect(b).to.eql(block)

      // check that internal cleanup works as expected
      expect(n.listenerCount(`block:${b.cid.multihash.toString('base64')}`)).to.equal(0)
      expect(n.listenerCount(`unwant:${b.cid.multihash.toString('base64')}`)).to.equal(0)
    })

    it('unwant block', async () => {
      const n = new Notifications()
      const b = blocks[0]

      const p = n.wantBlock(b.cid)

      n.unwantBlock(b.cid)

      await expect(p).to.eventually.be.rejectedWith(/unwanted/)
    })

    it('abort block want', async () => {
      const n = new Notifications()
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
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      const p = n.wantBlock(cid2)

      // check that listeners have been set up
      expect(n.listenerCount(`block:${cid2.multihash.toString('base64')}`)).to.equal(1)
      expect(n.listenerCount(`unwant:${cid2.multihash.toString('base64')}`)).to.equal(1)

      n.hasBlock(b)

      await expect(p).to.eventually.be.eql(b)

      // check that internal cleanup works as expected
      expect(n.listenerCount(`block:${cid2.multihash.toString('base64')}`)).to.equal(0)
      expect(n.listenerCount(`unwant:${cid2.multihash.toString('base64')}`)).to.equal(0)
    })

    it('unwant block', async () => {
      const n = new Notifications()
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      const p = n.wantBlock(cid2)

      n.unwantBlock(b.cid)

      await expect(p).to.eventually.be.rejectedWith(/unwanted/)
    })
  })
})
