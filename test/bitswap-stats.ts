/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { pEvent } from 'p-event'
import { DefaultBitswap } from '../src/bitswap.js'
import { BitswapMessage as Message } from '../src/message/index.js'
import { createLibp2pNode } from './utils/create-libp2p-node.js'
import { makeBlocks } from './utils/make-blocks.js'
import { makePeerIds } from './utils/make-peer-id.js'
import type { Libp2p, PeerId } from '@libp2p/interface'
import type { CID } from 'multiformats/cid'

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
  let libp2pNodes: Libp2p[]
  let bitswaps: DefaultBitswap[]
  let bs: DefaultBitswap
  let blocks: Array<{ cid: CID, block: Uint8Array }>
  let ids: PeerId[]

  before(async () => {
    const nodes = [0, 1]
    blocks = await makeBlocks(2)
    ids = await makePeerIds(2)

    // create 2 libp2p nodes
    libp2pNodes = await Promise.all(nodes.map(async (i) => createLibp2pNode({
      DHT: true
    })))

    // create bitswaps
    bitswaps = libp2pNodes.map((node, i) =>
      new DefaultBitswap(node, new MemoryBlockstore(), {
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
      bitswaps.map(async (bs) => { await bs.stop() })
    )
    await Promise.all(
      libp2pNodes.map(async (n) => { await n.stop() })
    )
  })

  it('has initial stats', () => {
    const stats = bs.stats
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
    bs.stats.once('update', (stats) => {
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
      const movingAverages = bs.stats.movingAverages
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
    blocks.forEach((block) => { msg.addBlock(block.cid, block.block) })

    void bs._receiveMessage(other, msg)
  })

  it('updates duplicate blocks counters', (done) => {
    bs.stats.once('update', (stats) => {
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
    blocks.forEach((block) => { msg.addBlock(block.cid, block.block) })

    void bs._receiveMessage(other, msg)
  })

  describe('connected to another bitswap', () => {
    let bs2: DefaultBitswap
    let block: { cid: CID, block: Uint8Array }

    before(async () => {
      bs2 = bitswaps[1]
      await bs2.start()

      const ma = libp2pNodes[1].getMultiaddrs()[0]
      await libp2pNodes[0].dial(ma)

      block = (await makeBlocks(1))[0]

      await bs.put(block.cid, block.block)
    })

    after(async () => {
      await bs2.stop()
    })

    it('updates stats on transfer', async () => {
      const originalStats = bs.stats.snapshot

      expect(originalStats.blocksReceived).to.equal(4n)
      expect(originalStats.dataReceived).to.equal(192n)
      expect(originalStats.dupBlksReceived).to.equal(2n)
      expect(originalStats.dupDataReceived).to.equal(96n)
      expect(originalStats.blocksSent).to.equal(0n)
      expect(originalStats.dataSent).to.equal(0n)
      expect(originalStats.providesBufferLength).to.equal(0n)
      expect(originalStats.wantListLength).to.equal(0n)
      expect(originalStats.peerCount).to.equal(1n)

      const deferred = pEvent(bs.stats, 'update')

      // pull block from bs to bs2
      await bs2.want(block.cid)

      const nextStats = await deferred

      expect(nextStats.blocksReceived).to.equal(4n)
      expect(nextStats.dataReceived).to.equal(192n)
      expect(nextStats.dupBlksReceived).to.equal(2n)
      expect(nextStats.dupDataReceived).to.equal(96n)
      expect(nextStats.blocksSent).to.equal(1n)
      expect(nextStats.dataSent).to.equal(48n)
      expect(nextStats.providesBufferLength).to.equal(0n)
      expect(nextStats.wantListLength).to.equal(0n)
      expect(nextStats.peerCount).to.equal(3n)
    })

    it('has peer stats', async () => {
      const peerStats = bs2.stats.forPeer(libp2pNodes[0].peerId)
      expect(peerStats).to.exist()

      if (peerStats == null) {
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
