/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { pEvent } from 'p-event'
import { BitswapMessage as Message } from '../src/message/index.js'
import { Bitswap } from '../src/bitswap.js'

import { MemoryBlockstore } from 'blockstore-core/memory'
import { createLibp2pNode } from './utils/create-libp2p-node.js'
import { makeBlocks } from './utils/make-blocks.js'
import { makePeerIds } from './utils/make-peer-id.js'

/**
 * @typedef {import('@libp2p/interface-libp2p').Libp2p} Libp2p
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
  /** @type {import('@libp2p/interface-peer-id').PeerId[]} */
  let ids

  before(async () => {
    const nodes = [0, 1]
    blocks = await makeBlocks(2)
    ids = await makePeerIds(2)

    // create 2 libp2p nodes
    libp2pNodes = await Promise.all(nodes.map((i) => createLibp2pNode({
      DHT: true
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
    await bs.start()
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
      expect(snapshot[key]).to.equal(BigInt(0))
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
      expect(stats.blocksReceived).to.equal(BigInt(2))
      expect(stats.dataReceived).to.equal(BigInt(96))
      expect(stats.dupBlksReceived).to.equal(BigInt(0))
      expect(stats.dupDataReceived).to.equal(BigInt(0))
      expect(stats.blocksSent).to.equal(BigInt(0))
      expect(stats.dataSent).to.equal(BigInt(0))
      expect(stats.providesBufferLength).to.equal(BigInt(0))
      expect(stats.wantListLength).to.equal(BigInt(0))
      expect(stats.peerCount).to.equal(BigInt(1))

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
      expect(stats.blocksReceived).to.equal(BigInt(4))
      expect(stats.dataReceived).to.equal(BigInt(192))
      expect(stats.dupBlksReceived).to.equal(BigInt(2))
      expect(stats.dupDataReceived).to.equal(BigInt(96))
      expect(stats.blocksSent).to.equal(BigInt(0))
      expect(stats.dataSent).to.equal(BigInt(0))
      expect(stats.providesBufferLength).to.equal(BigInt(0))
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
      await bs2.start()

      const ma = libp2pNodes[1].getMultiaddrs()[0]
      await libp2pNodes[0].dial(ma)

      block = (await makeBlocks(1))[0]

      await bs.put(block.cid, block.data)
    })

    after(async () => {
      await bs2.stop()
    })

    it('updates stats on transfer', async () => {
      const originalStats = bs.stat().snapshot

      expect(originalStats.blocksReceived).to.equal(BigInt(4))
      expect(originalStats.dataReceived).to.equal(BigInt(192))
      expect(originalStats.dupBlksReceived).to.equal(BigInt(2))
      expect(originalStats.dupDataReceived).to.equal(BigInt(96))
      expect(originalStats.blocksSent).to.equal(BigInt(0))
      expect(originalStats.dataSent).to.equal(BigInt(0))
      expect(originalStats.providesBufferLength).to.equal(BigInt(0))
      expect(originalStats.wantListLength).to.equal(BigInt(0))
      expect(originalStats.peerCount).to.equal(BigInt(1))

      const deferred = pEvent(bs.stat(), 'update')

      // pull block from bs to bs2
      await bs2.get(block.cid)

      const nextStats = await deferred

      expect(nextStats.blocksReceived).to.equal(BigInt(4))
      expect(nextStats.dataReceived).to.equal(BigInt(192))
      expect(nextStats.dupBlksReceived).to.equal(BigInt(2))
      expect(nextStats.dupDataReceived).to.equal(BigInt(96))
      expect(nextStats.blocksSent).to.equal(BigInt(1))
      expect(nextStats.dataSent).to.equal(BigInt(48))
      expect(nextStats.providesBufferLength).to.equal(BigInt(0))
      expect(nextStats.wantListLength).to.equal(BigInt(0))
      expect(nextStats.peerCount).to.equal(BigInt(2))
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

      expect(stats.blocksReceived).to.equal(BigInt(1))
      expect(stats.dataReceived).to.equal(BigInt(49))
      expect(stats.dupBlksReceived).to.equal(BigInt(0))
      expect(stats.dupDataReceived).to.equal(BigInt(0))
      expect(stats.blocksSent).to.equal(BigInt(0))
      expect(stats.dataSent).to.equal(BigInt(0))
      expect(stats.providesBufferLength).to.equal(BigInt(0))
      expect(stats.wantListLength).to.equal(BigInt(0))
      expect(stats.peerCount).to.equal(BigInt(1))

      const ma = peerStats.movingAverages.dataReceived[60000]
      expect(ma.movingAverage()).to.be.above(0)
      expect(ma.variance()).to.be.above(0)
    })
  })
})
