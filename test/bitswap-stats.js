/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const eachSeries = require('async/eachSeries')
const waterfall = require('async/waterfall')
const map = require('async/map')
const parallel = require('async/parallel')
const setImmediate = require('async/setImmediate')
const _ = require('lodash')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const mockNetwork = require('./utils/mocks').mockNetwork
const applyNetwork = require('./utils/mocks').applyNetwork
const mockLibp2pNode = require('./utils/mocks').mockLibp2pNode
const storeHasBlocks = require('./utils/store-has-blocks')
const makeBlock = require('./utils/make-block')
const orderedFinish = require('./utils/helpers').orderedFinish

describe.only('bitswap stats', () => {
  let repo
  let blocks
  let ids
  let bs

  before((done) => {
    parallel(
      {
        repo: (cb) => createTempRepo(cb),
        blocks: (cb) => map(_.range(15), (i, cb) => makeBlock(cb), cb),
        ids: (cb) => map(_.range(2), (i, cb) => PeerId.create({bits: 1024}, cb), cb)
      },
      (err, results) => {
        if (err) {
          return done(err)
        }

        repo = results.repo
        blocks = results.blocks
        ids = results.ids

        done()
      }
    )
  })

  before(() => {
    bs = new Bitswap(mockLibp2pNode(), repo.blocks, {
      statsUpdateInterval: 100 // fast update interval for so tests run fast
    })
  })

  before((done) => bs.start(done))

  after((done) => bs.stop(done))

  after((done) => repo.teardown(done))

  it('has initial stats', () => {
    const stats = bs.stat().snapshot
    expect(stats).to.have.property('blocksReceived', 0)
    expect(stats).to.have.property('dupBlksReceived', 0)
    expect(stats).to.have.property('dupDataReceived', 0)
  })

  it('updates blocks received', (done) => {
    bs.start((err) => {
      expect(err).to.not.exist()

      const stats = bs.stat()
      stats.once('update', (stats) => {
        expect(stats).to.have.property('blocksReceived', 2)
        expect(stats).to.have.property('dupBlksReceived', 0)
        expect(stats).to.have.property('dupDataReceived', 0)
        done()
      })

      const other = ids[1]

      const msg = new Message(false)
      blocks.slice(0, 2).forEach((block) => msg.addBlock(block))

      bs._receiveMessage(other, msg, (err) => {
        expect(err).to.not.exist()
      })
    })
  })

  it('updates duplicate blocks counters', (done) => {
    const stats = bs.stat()
    stats.once('update', (stats) => {
      expect(stats).to.have.property('blocksReceived', 4)
      expect(stats).to.have.property('dupBlksReceived', 2)
      expect(stats).to.have.property('dupDataReceived', 96)
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.slice(0, 2).forEach((block) => msg.addBlock(block))

    bs._receiveMessage(other, msg, (err) => {
      expect(err).to.not.exist()
    })
  })
})
