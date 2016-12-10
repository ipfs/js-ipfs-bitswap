/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const parallel = require('async/parallel')
const series = require('async/series')
const map = require('async/map')
const Block = require('ipfs-block')
const CID = require('cids')

const cs = require('../../src/constants')
const Message = require('../../src/types/message')
const WantManager = require('../../src/components/want-manager')

const mockNetwork = require('../utils').mockNetwork

describe.only('WantManager', () => {
  it('sends wantlist to all connected peers', (done) => {
    let cids
    let blocks

    parallel([
      (cb) => PeerId.create(cb),
      (cb) => PeerId.create(cb),
      (cb) => {
        const data = ['1', '2', '3']
        blocks = data.map((d) => new Block(d))
        map(blocks, (b, cb) => b.key(cb), (err, keys) => {
          if (err) {
            return done(err)
          }
          cids = keys.map((key) => new CID(key))
          cb()
        })
      }
    ], (err, peerIds) => {
      if (err) {
        return done(err)
      }

      const peer1 = peerIds[0]
      const peer2 = peerIds[1]
      const cid1 = cids[0]
      const cid2 = cids[1]
      const cid3 = cids[2]

      let wantManager

      const network = mockNetwork(6, (calls) => {
        expect(calls.connects).to.have.length(6)
        const m1 = new Message(true)

        m1.addEntry(cid1, cs.kMaxPriority)
        m1.addEntry(cid2, cs.kMaxPriority - 1)

        const m2 = new Message(false)

        m2.cancel(cid2)

        const m3 = new Message(false)

        m3.addEntry(cid3, cs.kMaxPriority)

        const msgs = [m1, m1, m2, m2, m3, m3]

        calls.messages.forEach((m, i) => {
          expect(m[0]).to.be.eql(calls.connects[i])
          expect(m[1].equals(msgs[i])).to.be.eql(true)
        })

        wantManager = null
        done()
      })

      wantManager = new WantManager(network)

      wantManager.run()
      wantManager.wantBlocks([cid1, cid2])

      wantManager.connected(peer1)
      wantManager.connected(peer2)

      series([
        (cb) => setTimeout(cb, 100),
        (cb) => {
          wantManager.cancelWants([cid2])
          cb()
        },
        (cb) => setTimeout(cb, 100)
      ], (err) => {
        expect(err).to.not.exist
        wantManager.wantBlocks([cid3])
      })
    })
  })
})
