/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const promisify = require('promisify-es6')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const makePeerId = require('./utils/make-peer-id')
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

  before(async () => {
    blocks = await makeBlock(2)
    ids = await makePeerId(2)
  })

  before(async () => {
    // create 2 temp repos
    repos = await Promise.all(nodes.map(() => createTempRepo()))
  })

  before(async () => {
    // create 2 libp2p nodes
    libp2pNodes = await Promise.all(nodes.map((n, i) => createLibp2pNode({
      DHT: repos[n].datastore
    })))
  })

  before(() => {
    bitswaps = nodes.map((node, i) =>
      new Bitswap(libp2pNodes[i], repos[i].blocks, {
        statsEnabled: true,
        statsComputeThrottleTimeout: 500 // fast update interval for tests
      }))
    bs = bitswaps[0]
    bs.wm.wantBlocks(blocks.map(b => b.cid))
  })

  // start the first bitswap
  before(() => bs.start())

  after(bitswaps.map((bs) => bs.stop()))

  after(() => repos.map(repo => repo.teardown()))

  after(() => libp2pNodes.map((n) => promisify(n.stop.bind(n))()))

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

    bs._receiveMessage(other, msg)
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

    bs._receiveMessage(other, msg)
  })

  describe('connected to another bitswap', () => {
    let bs2
    let block

    before(async () => {
      for (let i = 0; i < libp2pNodes.length; i++) {
        const node = libp2pNodes[i]
        await promisify(node.dial.bind(node))(libp2pNodes[(i + 1) % nodes.length].peerInfo)
      }
    })

    before(() => {
      bs2 = bitswaps[1]
      bs2.start()
    })

    after(() => {
      bs2.stop()
    })

    before(async () => {
      block = await makeBlock()
    })

    before(async () => {
      await bs.put(block)
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

      bs2.get(block.cid).then(() => {
        expect(block).to.exist()
        finish()
      }).catch((err) => {
        expect(err).to.not.exist()
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
