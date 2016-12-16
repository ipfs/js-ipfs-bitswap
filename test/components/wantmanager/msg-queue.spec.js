/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const map = require('async/map')
const parallel = require('async/parallel')
const Block = require('ipfs-block')
const CID = require('cids')

const Message = require('../../../src/types/message')
const MsgQueue = require('../../../src/components/want-manager/msg-queue')

describe('MessageQueue', () => {
  let peerId
  let blocks
  let cids

  before((done) => {
    parallel([
      (cb) => {
        PeerId.create((err, _peerId) => {
          expect(err).to.not.exist
          peerId = _peerId
          cb()
        })
      },
      (cb) => {
        const data = ['1', '2', '3', '4', '5', '6']
        blocks = data.map((d) => new Block(d))
        map(blocks, (b, cb) => b.key(cb), (err, keys) => {
          if (err) {
            return done(err)
          }
          cids = keys.map((key) => new CID(key))
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
      if (i === 3) {
        expect(connects).to.be.eql([peerId, peerId, peerId])

        const m1 = new Message(false)
        m1.addEntry(cid3, 1)
        m1.addEntry(cid4, 2)

        const m2 = new Message(false)
        m2.cancel(cid5)
        m2.cancel(cid6)

        expect(messages).to.be.eql([
          [peerId, m1],
          [peerId, m2],
          [peerId, msg]
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

    const mq = new MsgQueue(peerId, network)

    expect(mq.refcnt).to.equal(1)

    const batch1 = [
      new Message.Entry(cid3, 1, false),
      new Message.Entry(cid4, 2, false)
    ]

    const batch2 = [
      new Message.Entry(cid5, 1, true),
      new Message.Entry(cid6, 2, true)
    ]

    mq.run()
    mq.addEntries(batch1)
    mq.addEntries(batch2)
    mq.addMessage(msg)
  })
})
