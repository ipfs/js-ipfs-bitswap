/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const series = require('run-series')

const cs = require('../../src/constants')
const Message = require('../../src/message')
const Wantmanager = require('../../src/wantmanager')

const mockNetwork = require('../utils').mockNetwork

describe('Wantmanager', () => {
  it('sends wantlist to all connected peers', (done) => {
    const peer1 = PeerId.create({bits: 64})
    const peer2 = PeerId.create({bits: 64})
    let wm
    const network = mockNetwork(6, (calls) => {
      expect(calls.connects).to.have.length(6)
      const m1 = new Message(true)
      m1.addEntry(new Buffer('hello'), cs.kMaxPriority)
      m1.addEntry(new Buffer('world'), cs.kMaxPriority - 1)

      const m2 = new Message(false)
      m2.cancel(new Buffer('world'))

      const m3 = new Message(false)
      m3.addEntry(new Buffer('foo'), cs.kMaxPriority)

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
    wm.wantBlocks([new Buffer('hello'), new Buffer('world')])

    wm.connected(peer1)
    wm.connected(peer2)

    series([
      (cb) => setTimeout(cb, 100),
      (cb) => {
        wm.cancelWants([new Buffer('world')])
        cb()
      },
      (cb) => setTimeout(cb, 100),
      (cb) => {
        wm.wantBlocks([new Buffer('foo')])
        cb()
      },
      (cb) => setTimeout(cb, 100)
    ], () => {
      wm.disconnected(peer1)
      wm.disconnected(peer2)
    })
  })
})
