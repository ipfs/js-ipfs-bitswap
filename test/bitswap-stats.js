/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const pEvent = require('p-event')
const delay = require('delay')
const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const makePeerId = require('./utils/make-peer-id')

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
  let libp2pNodes
  let repos
  let bitswaps
  let bs
  let blocks
  let ids

  before(async () => {
    const nodes = [0, 1]
    blocks = await makeBlock(2)
    ids = await makePeerId(2)

    // create 2 temp repos
    repos = await Promise.all(nodes.map(() => createTempRepo()))

    // create 2 libp2p nodes
    libp2pNodes = await Promise.all(nodes.map((i) => createLibp2pNode({
      datastore: repos[i].datastore,
      config: {
        dht: {
          enabled: true
        }
      }
    })))

    // create bitswaps
    bitswaps = libp2pNodes.map((node, i) =>
      new Bitswap(node, repos[i].blocks, {
        statsEnabled: true,
        statsComputeThrottleTimeout: 500 // fast update interval for tests
      })
    )
    bs = bitswaps[0]
    bs.wm.wantBlocks(blocks.map(b => b.cid))

    // start the first bitswap
    bs.start()
  })

  after(async () => {
    await Promise.all(
      bitswaps.map((bs) => bs.stop())
    )
    await Promise.all(
      repos.map(repo => repo.teardown())
    )
    await Promise.all(
      libp2pNodes.map((n) => n.stop())
    )
  })

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
      await Promise.all([
        libp2pNodes[0].dial(libp2pNodes[1].peerInfo),
        libp2pNodes[1].dial(libp2pNodes[0].peerInfo)
      ])

      bs2 = bitswaps[1]
      bs2.start()

      block = await makeBlock()

      await bs.put(block)
    })

    after(() => {
      bs2.stop()
    })

    it('updates stats on transfer', async () => {
      const originalStats = bs.stat().snapshot

      expect(originalStats.blocksReceived.toNumber()).to.equal(4)
      expect(originalStats.dataReceived.toNumber()).to.equal(192)
      expect(originalStats.dupBlksReceived.toNumber()).to.equal(2)
      expect(originalStats.dupDataReceived.toNumber()).to.equal(96)
      expect(originalStats.blocksSent.toNumber()).to.equal(0)
      expect(originalStats.dataSent.toNumber()).to.equal(0)
      expect(originalStats.providesBufferLength.toNumber()).to.equal(0)
      expect(originalStats.wantListLength.toNumber()).to.equal(0)
      expect(originalStats.peerCount.toNumber()).to.equal(1)

      // pull block from bs to bs2
      await bs2.get(block.cid)

      await delay(100)

      const nextStats = await pEvent(bs.stat(), 'update')

      expect(nextStats.blocksReceived.toNumber()).to.equal(4)
      expect(nextStats.dataReceived.toNumber()).to.equal(192)
      expect(nextStats.dupBlksReceived.toNumber()).to.equal(2)
      expect(nextStats.dupDataReceived.toNumber()).to.equal(96)
      expect(nextStats.blocksSent.toNumber()).to.equal(1)
      expect(nextStats.dataSent.toNumber()).to.equal(48)
      expect(nextStats.providesBufferLength.toNumber()).to.equal(0)
      expect(nextStats.wantListLength.toNumber()).to.equal(0)
      expect(nextStats.peerCount.toNumber()).to.equal(2)
    })

    it('has peer stats', async () => {
      const peerStats = bs2.stat().forPeer(libp2pNodes[0].peerInfo.id)
      expect(peerStats).to.exist()

      const stats = await pEvent(peerStats, 'update')

      expect(stats.blocksReceived.toNumber()).to.equal(1)
      expect(stats.dataReceived.toNumber()).to.equal(48)
      expect(stats.dupBlksReceived.toNumber()).to.equal(0)
      expect(stats.dupDataReceived.toNumber()).to.equal(0)
      expect(stats.blocksSent.toNumber()).to.equal(0)
      expect(stats.dataSent.toNumber()).to.equal(0)
      expect(stats.providesBufferLength.toNumber()).to.equal(0)
      expect(stats.wantListLength.toNumber()).to.equal(0)
      expect(stats.peerCount.toNumber()).to.equal(1)

      const ma = peerStats.movingAverages.dataReceived[60000]
      expect(ma.movingAverage()).to.be.above(0)
      expect(ma.variance()).to.be.above(0)
    })
  })
})
