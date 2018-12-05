/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const map = require('async/map')
const parallel = require('async/parallel')
const PeerId = require('peer-id')

const Notifications = require('../src/notifications')

const makeBlock = require('./utils/make-block')

describe('Notifications', () => {
  let blocks
  let peerId

  before((done) => {
    parallel([
      (cb) => map([0, 1, 2], (i, cb) => makeBlock(cb), (err, res) => {
        expect(err).to.not.exist()
        blocks = res
        cb()
      }),
      (cb) => PeerId.create({ bits: 512 }, (err, id) => {
        expect(err).to.not.exist()
        peerId = id
        cb()
      })
    ], done)
  })

  it('hasBlock', (done) => {
    const n = new Notifications(peerId)
    const b = blocks[0]
    n.once(`block:${b.cid.buffer.toString()}`, (block) => {
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
})
