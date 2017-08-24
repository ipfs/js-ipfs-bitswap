/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const parallel = require('async/parallel')
const series = require('async/series')
const map = require('async/map')
const _ = require('lodash')

const cs = require('../../src/constants')
const Message = require('../../src/types/message')
const WantManager = require('../../src/want-manager')

const mockNetwork = require('../utils/mocks').mockNetwork
const makeBlock = require('../utils/make-block')

describe('WantManager', () => {
  it('sends wantlist to all connected peers', function (done) {
    this.timeout(80 * 1000)

    let cids
    let blocks

    parallel([
      (cb) => PeerId.create(cb),
      (cb) => PeerId.create(cb),
      (cb) => PeerId.create(cb),
      (cb) => {
        map(_.range(3), (i, cb) => makeBlock(cb), (err, res) => {
          expect(err).to.not.exist()
          blocks = res
          cids = blocks.map((b) => b.cid)
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

      const m1 = new Message(true)
      m1.addEntry(cid1, cs.kMaxPriority)
      m1.addEntry(cid2, cs.kMaxPriority - 1)

      const m2 = new Message(false)
      m2.cancel(cid2)

      const m3 = new Message(false)
      m3.addEntry(cid3, cs.kMaxPriority)

      const msgs = [m1, m1, m2, m2, m3, m3]

      const network = mockNetwork(6, (calls) => {
        expect(calls.connects).to.have.length(6)
        expect(calls.messages).to.have.length(6)

        calls.messages.forEach((m, i) => {
          expect(m[0]).to.be.eql(calls.connects[i])
          if (!m[1].equals(msgs[i])) {
            return done(
              new Error(`expected ${m[1].toString()} to equal ${msgs[1].toString()}`)
            )
          }
        })

        done()
      })

      const wantManager = new WantManager(peerIds[2], network)

      wantManager.start((err) => {
        expect(err).to.not.exist()
        wantManager.wantBlocks([cid1, cid2])

        wantManager.connected(peer1)
        wantManager.connected(peer2)

        series([
          (cb) => setTimeout(cb, 200),
          (cb) => {
            wantManager.cancelWants([cid2])
            cb()
          },
          (cb) => setTimeout(cb, 200)
        ], (err) => {
          expect(err).to.not.exist()
          wantManager.wantBlocks([cid3])
        })
      })
    })
  })
})
