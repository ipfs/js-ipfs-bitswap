/* eslint-env mocha */
'use strict'

const map = require('async/map')
const each = require('async/each')
const eachOf = require('async/eachOf')
const parallel = require('async/parallel')
const _ = require('lodash')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const countToFinish = require('./utils/helpers').countToFinish

const expectedStats = [
  'blocksReceived',
  'dataReceived',
  'dupBlksReceived',
  'dupDataReceived',
  'blocksSent',
  'dataSent',
  'providesBufferLength',
  'wantListLength'
]

const expectedTimeWindows = [
  1000 * 60,
  1000 * 60 * 5,
  1000 * 60 * 15
]

describe('bitswap stats', () => {
  const nodes = [0, 1]
  let libp2pNodes
  let repos
  let bitswaps
  let bs
  let blocks
  let ids

  before((done) => {
    parallel({
      blocks: (cb) => map(_.range(2), (i, cb) => makeBlock(cb), cb),
      ids: (cb) => map(_.range(2), (i, cb) => PeerId.create({ bits: 512 }, cb), cb)
    },
    (err, results) => {
      expect(err).to.not.exist()

      blocks = results.blocks
      ids = results.ids
      done()
    })
  })

  before((done) => {
    // create 2 temp repos
    map(nodes, (n, cb) => createTempRepo(cb), (err, _repos) => {
      expect(err).to.not.exist()
      repos = _repos
      done()
    })
  })

  before((done) => {
    // create 2 libp2p nodes
    map(nodes, (n, cb) => createLibp2pNode({
      DHT: repos[n].datastore
    }, cb), (err, _libp2pNodes) => {
      expect(err).to.not.exist()

      libp2pNodes = _libp2pNodes
      done()
    })
  })

  before(() => {
    bitswaps = nodes.map((node, i) =>
      new Bitswap(libp2pNodes[i], repos[i].blocks, {
        statsEnabled: true,
        statsComputeThrottleTimeout: 500 // fast update interval for tests
      }))
    bs = bitswaps[0]
  })

  // start the first bitswap
  before((done) => bs.start(done))

  after((done) => each(bitswaps, (bs, cb) => bs.stop(cb), done))

  after((done) => each(repos, (repo, cb) => repo.teardown(cb), done))

  after((done) => each(libp2pNodes, (n, cb) => n.stop(cb), done))

  it('has initial stats', () => {
    const stats = bs.stat()
    const snapshot = stats.snapshot

    expectedStats.forEach((key) => {
      expect(snapshot).to.have.property(key)
      expect(snapshot[key].eq(0)).to.be.true()
    })

    const movingAverages = stats.movingAverages
    expectedStats.forEach((key) => {
      expectedTimeWindows.forEach((timeWindow) => {
        expect(movingAverages).to.have.property(key)
        expect(stats.movingAverages[key]).to.have.property(timeWindow)
        const ma = stats.movingAverages[key][timeWindow]
        expect(ma.movingAverage()).to.eql(0)
        expect(ma.variance()).to.eql(0)
      })
    })
  })

  it('updates blocks received', (done) => {
    bs.stat().once('update', (stats) => {
      expect(stats.blocksReceived.eq(2)).to.be.true()
      expect(stats.dataReceived.eq(96)).to.be.true()
      expect(stats.dupBlksReceived.eq(0)).to.be.true()
      expect(stats.dupDataReceived.eq(0)).to.be.true()
      expect(stats.blocksSent.eq(0)).to.be.true()
      expect(stats.dataSent.eq(0)).to.be.true()
      expect(stats.providesBufferLength.eq(0)).to.be.true()
      expect(stats.wantListLength.eq(0)).to.be.true()
      expect(stats.peerCount.eq(1)).to.be.true()

      // test moving averages
      const movingAverages = bs.stat().movingAverages
      const blocksReceivedMA = movingAverages.blocksReceived
      expectedTimeWindows.forEach((timeWindow) => {
        expect(blocksReceivedMA).to.have.property(timeWindow)
        const ma = blocksReceivedMA[timeWindow]
        expect(ma.movingAverage()).to.be.above(0)
        expect(ma.variance()).to.be.above(0)
      })

      const dataReceivedMA = movingAverages.dataReceived
      expectedTimeWindows.forEach((timeWindow) => {
        expect(dataReceivedMA).to.have.property(timeWindow)
        const ma = dataReceivedMA[timeWindow]
        expect(ma.movingAverage()).to.be.above(0)
        expect(ma.variance()).to.be.above(0)
      })
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.forEach((block) => msg.addBlock(block))

    bs._receiveMessage(other, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  it('updates duplicate blocks counters', (done) => {
    bs.stat().once('update', (stats) => {
      expect(stats.blocksReceived.eq(4)).to.be.true()
      expect(stats.dataReceived.eq(192)).to.be.true()
      expect(stats.dupBlksReceived.eq(2)).to.be.true()
      expect(stats.dupDataReceived.eq(96)).to.be.true()
      expect(stats.blocksSent.eq(0)).to.be.true()
      expect(stats.dataSent.eq(0)).to.be.true()
      expect(stats.providesBufferLength.eq(0)).to.be.true()
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.forEach((block) => msg.addBlock(block))

    bs._receiveMessage(other, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  describe('connected to another bitswap', () => {
    let bs2
    let block

    before((done) => {
      eachOf(
        libp2pNodes,
        (node, i, cb) => node.dial(libp2pNodes[(i + 1) % nodes.length].peerInfo, cb),
        done)
    })

    before((done) => {
      bs2 = bitswaps[1]
      bs2.start(done)
    })

    after((done) => {
      bs2.stop(done)
    })

    before((done) => {
      makeBlock((err, _block) => {
        expect(err).to.not.exist()
        expect(_block).to.exist()
        block = _block
        done()
      })
    })

    before((done) => {
      bs.put(block, done)
    })

    it('updates stats on transfer', (done) => {
      const finish = countToFinish(2, done)
      bs.stat().once('update', (stats) => {
        expect(stats.blocksReceived.eq(4)).to.be.true()
        expect(stats.dataReceived.eq(192)).to.be.true()
        expect(stats.dupBlksReceived.eq(2)).to.be.true()
        expect(stats.dupDataReceived.eq(96)).to.be.true()
        expect(stats.blocksSent.eq(1)).to.be.true()
        expect(stats.dataSent.eq(48)).to.be.true()
        expect(stats.providesBufferLength.eq(0)).to.be.true()
        expect(stats.wantListLength.eq(0)).to.be.true()
        expect(stats.peerCount.eq(2)).to.be.true()
        finish()
      })

      bs2.get(block.cid, (err, block) => {
        expect(err).to.not.exist()
        expect(block).to.exist()
        finish()
      })
    })

    it('has peer stats', (done) => {
      const peerIds = libp2pNodes.map((node) => node.peerInfo.id.toB58String())
      const peerStats = bs2.stat().forPeer(peerIds[0])
      peerStats.once('update', (stats) => {
        expect(stats.blocksReceived.eq(1)).to.be.true()
        expect(stats.dataReceived.eq(48)).to.be.true()
        expect(stats.dupBlksReceived.eq(0)).to.be.true()
        expect(stats.dupDataReceived.eq(0)).to.be.true()
        expect(stats.blocksSent.eq(0)).to.be.true()
        expect(stats.dataSent.eq(0)).to.be.true()
        expect(stats.providesBufferLength.eq(0)).to.be.true()
        expect(stats.wantListLength.eq(0)).to.be.true()
        expect(stats.peerCount.eq(1)).to.be.true()

        const ma = peerStats.movingAverages.dataReceived[60000]
        expect(ma.movingAverage()).to.be.above(0)
        expect(ma.variance()).to.be.above(0)

        done()
      })
    })
  })
})
