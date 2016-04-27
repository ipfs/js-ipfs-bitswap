/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const async = require('async')

const cs = require('../../src/constants')
const Message = require('../../src/message')
const Wantmanager = require('../../src/wantmanager')

function mockNetwork (calls, done) {
  const connects = []
  const messages = []
  let i = 0

  const finish = () => {
    i++
    if (i === calls) {
      done({connects, messages})
    }
  }

  return {
    connectTo (p, cb) {
      async.setImmediate(() => {
        connects.push(p)
        cb()
      })
    },
    sendMessage (p, msg, cb) {
      async.setImmediate(() => {
        messages.push([p, msg])
        cb()
        finish()
      })
    }
  }
}

describe('Wantmanager', () => {
  it('sends wantlist to all connected peers', (done) => {
    const peer1 = PeerId.create({bits: 64})
    const peer2 = PeerId.create({bits: 64})
    let wm
    const network = mockNetwork(6, (calls) => {
      expect(calls.connects).to.have.length(6)
      const m1 = new Message(true)
      m1.addEntry('hello', cs.kMaxPriority)
      m1.addEntry('world', cs.kMaxPriority - 1)

      const m2 = new Message(false)
      m2.cancel('world')

      const m3 = new Message(false)
      m3.addEntry('foo', cs.kMaxPriority - 2)

      const msgs = [m1, m1, m2, m2, m3, m3]

      calls.messages.forEach((m, i) => {
        expect(m[0]).to.be.eql(calls.connects[i])
        expect(m[1].equals(msgs[i])).to.be.eql(true)
      })

      wm = null
      done()
    })

    wm = new Wantmanager(network)

    wm.run()
    wm.wantBlocks(['hello', 'world'])

    wm.connected(peer1)
    wm.connected(peer2)

    setTimeout(() => {
      wm.cancelWants(['world'])
      setTimeout(() => {
        wm.wantBlocks(['foo'])
      }, 100)
    }, 100)
  })
})
