/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const CID = require('cids')
const Block = require('ipld-block')

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
    it('receive block', (done) => {
      const n = new Notifications(peerId)
      const b = blocks[0]

      n.wantBlock(b.cid, (block) => {
        expect(b).to.eql(block)

        // check that internal cleanup works as expected
        expect(Object.keys(n._blockListeners)).to.have.length(0)
        expect(Object.keys(n._unwantListeners)).to.have.length(0)
        done()
      }, () => {
        done(new Error('should never happen'))
      })

      n.hasBlock(b)
    })

    it('unwant block', (done) => {
      const n = new Notifications()
      const b = blocks[0]

      n.wantBlock(b.cid, () => {
        done(new Error('should never happen'))
      }, done)

      n.unwantBlock(b.cid)
    })
  })

  describe('wantBlock with same cid derived from distinct encodings', () => {
    it('receive block', (done) => {
      const n = new Notifications(peerId)
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      n.wantBlock(cid2, (block) => {
        expect(b).to.eql(block)

        // check that internal cleanup works as expected
        expect(Object.keys(n._blockListeners)).to.have.length(0)
        expect(Object.keys(n._unwantListeners)).to.have.length(0)
        done()
      }, () => {
        done(new Error('should never happen'))
      })

      n.hasBlock(b)
    })

    it('unwant block', (done) => {
      const n = new Notifications()
      const cid = new CID(blocks[0].cid.toV1().toString('base64'))
      const b = new Block(blocks[0].data, cid)

      const cid2 = new CID(b.cid.toString('base32'))
      n.wantBlock(cid2, () => {
        done(new Error('should never happen'))
      }, done)

      n.unwantBlock(b.cid)
    })
  })
})
