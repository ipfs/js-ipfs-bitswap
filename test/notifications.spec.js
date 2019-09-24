/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))

const expect = chai.expect
const CID = require('cids')
const Block = require('ipfs-block')

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
    n.once(`block:${b.cid}`, (block) => {
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

      n.hasBlock(b)

      const block = await p

      expect(b).to.eql(block)

      // check that internal cleanup works as expected
      expect(Object.keys(n._blockListeners)).to.have.length(0)
      expect(Object.keys(n._unwantListeners)).to.have.length(0)
    })

    it('unwant block', async () => {
      const n = new Notifications()
      const b = blocks[0]

      const p = n.wantBlock(b.cid)

      n.unwantBlock(b.cid)

      const block = await p

      expect(block).to.be.undefined()
    })
  })

  describe('wantBlock with same cid derived from distinct encodings', () => {
    it('receive block', async () => {
      const n = new Notifications(peerId)
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      const p = n.wantBlock(cid2)

      n.hasBlock(b)

      const block = await p

      expect(b).to.eql(block)

      // check that internal cleanup works as expected
      expect(Object.keys(n._blockListeners)).to.have.length(0)
      expect(Object.keys(n._unwantListeners)).to.have.length(0)
    })

    it('unwant block', async () => {
      const n = new Notifications()
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      const p = n.wantBlock(cid2)

      n.unwantBlock(b.cid)

      const block = await p

      expect(block).to.be.undefined()
    })
  })
})
