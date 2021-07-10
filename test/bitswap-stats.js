/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const pEvent = require('p-event')
const Message = require('../src/types/message')
const Bitswap = require('../src/bitswap')

const { MemoryBlockstore } = require('interface-blockstore')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-blocks')
const { makePeerIds } = require('./utils/make-peer-id')

/**
 * @typedef {import('libp2p')} Libp2p
 * @typedef {import('multiformats/cid').CID} CID
 */

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
  /** @type {Libp2p[]} */
  let libp2pNodes
  /** @type {Bitswap[]} */
  let bitswaps
  /** @type {Bitswap} */
  let bs
  /** @type {{ cid: CID, data: Uint8Array}[]} */
  let blocks
  /** @type {import('peer-id')[]} */
  let ids

  before(async () => {
    const nodes = [0, 1]
    blocks = await makeBlock(2)
    ids = await makePeerIds(2)

    // create 2 libp2p nodes
    libp2pNodes = await Promise.all(nodes.map((i) => createLibp2pNode({
      config: {
        dht: {
          enabled: true
        }
      }
    })))

    // create bitswaps
    bitswaps = libp2pNodes.map((node, i) =>
      new Bitswap(node, new MemoryBlockstore(), {
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
      libp2pNodes.map((n) => n.stop())
    )
  })

  it('has initial stats', () => {
    const stats = bs.stat()
    const snapshot = stats.snapshot

    expectedStats.forEach((key) => {
      expect(snapshot).to.have.property(key)
      expect(snapshot[key]).to.equal(0n)
    })

    const movingAverages = stats.movingAverages
    expectedStats.forEach((key) => {
      expectedTimeWindows.forEach((timeWindow) => {
        expect(movingAverages).to.have.property(key)
        expect(stats.movingAverages[key]).to.have.property(`${timeWindow}`)
        const ma = stats.movingAverages[key][timeWindow]
        expect(ma.movingAverage()).to.eql(0)
        expect(ma.variance()).to.eql(0)
      })
    })
  })

  it('updates blocks received', (done) => {
    bs.stat().once('update', (stats) => {
      expect(stats.blocksReceived).to.equal(2n)
      expect(stats.dataReceived).to.equal(96n)
      expect(stats.dupBlksReceived).to.equal(0n)
      expect(stats.dupDataReceived).to.equal(0n)
      expect(stats.blocksSent).to.equal(0n)
      expect(stats.dataSent).to.equal(0n)
      expect(stats.providesBufferLength).to.equal(0n)
      expect(stats.wantListLength).to.equal(0n)
      expect(stats.peerCount).to.equal(1n)

      // test moving averages
      const movingAverages = bs.stat().movingAverages
      const blocksReceivedMA = movingAverages.blocksReceived
      expectedTimeWindows.forEach((timeWindow) => {
        expect(blocksReceivedMA).to.have.property(`${timeWindow}`)
        const ma = blocksReceivedMA[timeWindow]
        expect(ma.movingAverage()).to.be.above(0)
        expect(ma.variance()).to.be.above(0)
      })

      const dataReceivedMA = movingAverages.dataReceived
      expectedTimeWindows.forEach((timeWindow) => {
        expect(dataReceivedMA).to.have.property(`${timeWindow}`)
        const ma = dataReceivedMA[timeWindow]
        expect(ma.movingAverage()).to.be.above(0)
        expect(ma.variance()).to.be.above(0)
      })
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.forEach((block) => msg.addBlock(block.cid, block.data))

    bs._receiveMessage(other, msg)
  })

  it('updates duplicate blocks counters', (done) => {
    bs.stat().once('update', (stats) => {
      expect(stats.blocksReceived).to.equal(4n)
      expect(stats.dataReceived).to.equal(192n)
      expect(stats.dupBlksReceived).to.equal(2n)
      expect(stats.dupDataReceived).to.equal(96n)
      expect(stats.blocksSent).to.equal(0n)
      expect(stats.dataSent).to.equal(0n)
      expect(stats.providesBufferLength).to.equal(0n)
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.forEach((block) => msg.addBlock(block.cid, block.data))

    bs._receiveMessage(other, msg)
  })

  describe('connected to another bitswap', () => {
    /** @type {Bitswap} */
    let bs2
    /** @type {{ cid: CID, data: Uint8Array}} */
    let block

    before(async () => {
      bs2 = bitswaps[1]
      bs2.start()

      const ma = `${libp2pNodes[1].multiaddrs[0]}/p2p/${libp2pNodes[1].peerId.toB58String()}`
      await libp2pNodes[0].dial(ma)

      block = (await makeBlock(1))[0]

      await bs.put(block.cid, block.data)
    })

    after(() => {
      bs2.stop()
    })

    it('updates stats on transfer', async () => {
      const originalStats = bs.stat().snapshot

      expect(originalStats.blocksReceived).to.equal(4n)
      expect(originalStats.dataReceived).to.equal(192n)
      expect(originalStats.dupBlksReceived).to.equal(2n)
      expect(originalStats.dupDataReceived).to.equal(96n)
      expect(originalStats.blocksSent).to.equal(0n)
      expect(originalStats.dataSent).to.equal(0n)
      expect(originalStats.providesBufferLength).to.equal(0n)
      expect(originalStats.wantListLength).to.equal(0n)
      expect(originalStats.peerCount).to.equal(1n)

      const deferred = pEvent(bs.stat(), 'update')

      // pull block from bs to bs2
      await bs2.get(block.cid)

      const nextStats = await deferred

      expect(nextStats.blocksReceived).to.equal(4n)
      expect(nextStats.dataReceived).to.equal(192n)
      expect(nextStats.dupBlksReceived).to.equal(2n)
      expect(nextStats.dupDataReceived).to.equal(96n)
      expect(nextStats.blocksSent).to.equal(1n)
      expect(nextStats.dataSent).to.equal(48n)
      expect(nextStats.providesBufferLength).to.equal(0n)
      expect(nextStats.wantListLength).to.equal(0n)
      expect(nextStats.peerCount).to.equal(2n)
    })

    it('has peer stats', async () => {
      const peerStats = bs2.stat().forPeer(libp2pNodes[0].peerId)
      expect(peerStats).to.exist()

      if (!peerStats) {
        // needed for ts
        throw new Error('No stats found for peer')
      }

      // trigger an update
      peerStats.push('dataReceived', 1)

      const stats = await pEvent(peerStats, 'update')

      expect(stats.blocksReceived).to.equal(1n)
      expect(stats.dataReceived).to.equal(49n)
      expect(stats.dupBlksReceived).to.equal(0n)
      expect(stats.dupDataReceived).to.equal(0n)
      expect(stats.blocksSent).to.equal(0n)
      expect(stats.dataSent).to.equal(0n)
      expect(stats.providesBufferLength).to.equal(0n)
      expect(stats.wantListLength).to.equal(0n)
      expect(stats.peerCount).to.equal(1n)

      const ma = peerStats.movingAverages.dataReceived[60000]
      expect(ma.movingAverage()).to.be.above(0)
      expect(ma.variance()).to.be.above(0)
    })
  })
})
