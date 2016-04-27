/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')

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
      connects.push(p)
      cb()
    },
    sendMessage (p, msg, cb) {
      messages.push([p, msg])
      cb()
      finish()
    }
  }
}

describe('Wantmanager', () => {
  it('sends wantlist to all connected peers', (done) => {
    const peer1 = PeerId.create({bits: 64})
    const peer2 = PeerId.create({bits: 64})

    const network = mockNetwork(4, (calls) => {
      expect(calls.connects).to.have.length(4)

      const m1 = new Message(true)
      m1.addEntry('hello', 1)
      m1.addEntry('world', 1)

      const m2 = new Message(false)
      m2.cancel('world')

      const m3 = new Message(false)
      m3.addEntry('foo', 1)

      expect(
        calls.messages
      ).to.be.eql([
        [peer1, m1],
        [peer2, m1],
        [peer1, m2],
        [peer2, m2]
      ])

      done()
    })

    const wm = new Wantmanager(network)

    wm.run()
    wm.wantBlocks(['hello', 'world'])

    wm.connected(peer1)
    wm.connected(peer2)

    setTimeout(() => {
      wm.cancelWants(['world'])
      wm.wantBlocks(['foo'])
    }, 10)
  })
})
