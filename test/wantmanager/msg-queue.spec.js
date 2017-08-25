/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const map = require('async/map')
const parallel = require('async/parallel')
const CID = require('cids')
const multihashing = require('multihashing-async')
const Buffer = require('safe-buffer').Buffer

const Message = require('../../src/types/message')
const MsgQueue = require('../../src/want-manager/msg-queue')

describe('MessageQueue', () => {
  let peerIds
  let cids

  before((done) => {
    parallel([
      (cb) => map([0, 1], (i, cb) => PeerId.create({bits: 1024}, cb), (err, res) => {
        expect(err).to.not.exist()
        peerIds = res
        cb()
      }),
      (cb) => {
        const data = ['1', '2', '3', '4', '5', '6'].map((d) => Buffer.from(d))
        map(data, (d, cb) => multihashing(d, 'sha2-256', cb), (err, hashes) => {
          expect(err).to.not.exist()
          cids = hashes.map((h) => new CID(h))
          cb()
        })
      }
    ], done)
  })

  it('connects and sends messages', (done) => {
    const msg = new Message(true)
    const cid1 = cids[0]
    const cid2 = cids[1]
    const cid3 = cids[2]
    const cid4 = cids[3]
    const cid5 = cids[4]
    const cid6 = cids[5]

    msg.addEntry(cid1, 3)
    msg.addEntry(cid2, 1)

    const messages = []
    const connects = []
    let i = 0

    const finish = () => {
      i++
      if (i === 2) {
        expect(connects).to.be.eql([peerIds[1], peerIds[1]])

        const m1 = new Message(false)
        m1.addEntry(cid3, 1)
        m1.addEntry(cid4, 2)
        m1.cancel(cid5)
        m1.cancel(cid6)

        expect(
          messages
        ).to.be.eql([
          [peerIds[1], msg],
          [peerIds[1], m1]
        ])

        done()
      }
    }

    const network = {
      connectTo (p, cb) {
        connects.push(p)
        cb()
      },
      sendMessage (p, msg, cb) {
        messages.push([p, msg])
        cb()
        finish()
      }
    }

    const mq = new MsgQueue(peerIds[0], peerIds[1], network)

    expect(mq.refcnt).to.equal(1)

    const batch1 = [
      new Message.Entry(cid3, 1, false),
      new Message.Entry(cid4, 2, false)
    ]

    const batch2 = [
      new Message.Entry(cid5, 1, true),
      new Message.Entry(cid6, 2, true)
    ]

    mq.addEntries(batch1)
    mq.addEntries(batch2)
    mq.addMessage(msg)
  })
})
