/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')

const Message = require('../../src/message')
const MsgQueue = require('../../src/wantmanager/msg-queue')

describe('MsgQueue', () => {
  it('connects and sends messages', (done) => {
    const id = PeerId.create({bits: 64})
    const msg = new Message(true)
    msg.addEntry('hello world', 3)
    msg.addEntry('foo bar', 1)

    const messages = []
    const connects = []
    let i = 0
    const finish = () => {
      i++
      if (i === 3) {
        expect(
          connects
        ).to.be.eql([
          id, id, id
        ])

        const m1 = new Message(false)
        m1.addEntry('hello', 1)
        m1.addEntry('world', 2)
        const m2 = new Message(false)
        m2.cancel('foo')
        m2.cancel('bar')

        expect(
          messages
        ).to.be.eql([
          [id, m1],
          [id, m2],
          [id, msg]
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
    const mq = new MsgQueue(id, network)

    expect(mq.refcnt).to.be.eql(1)

    const batch1 = [
      new Message.Entry('hello', 1, false),
      new Message.Entry('world', 2, false)
    ]

    const batch2 = [
      new Message.Entry('foo', 1, true),
      new Message.Entry('bar', 2, true)
    ]

    mq.run()
    mq.addEntries(batch1)
    mq.addEntries(batch2)
    mq.addMessage(msg)
  })
})
