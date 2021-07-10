/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const PeerId = require('peer-id')
const sinon = require('sinon')
const pWaitFor = require('p-wait-for')

const Bitswap = require('../src/bitswap')

const { MemoryBlockstore } = require('interface-blockstore')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-blocks')
const orderedFinish = require('./utils/helpers').orderedFinish
const Message = require('../src/types/message')

/**
 * @typedef {import('libp2p')} Libp2p
 */

/**
 * Creates a repo + libp2pNode + Bitswap with or without DHT
 *
 * @param {boolean} dht
 */
async function createThing (dht) {
  const libp2pNode = await createLibp2pNode({
    DHT: dht
  })
  const bitswap = new Bitswap(libp2pNode, new MemoryBlockstore())
  bitswap.start()
  return { libp2pNode, bitswap }
}

describe('start/stop', () => {
  it('should tell us if the node is started or not', async () => {
    const libp2p = {
      handle: () => {},
      unhandle: () => {},
      registrar: {
        register: () => {}
      },
      peerStore: {
        peers: {
          values: () => []
        }
      }
    }
    // @ts-ignore not a full libp2p
    const bitswap = new Bitswap(libp2p, new MemoryBlockstore())

    expect(bitswap.isStarted()).to.be.false()

    bitswap.start()

    expect(bitswap.isStarted()).to.be.true()

    bitswap.stop()

    expect(bitswap.isStarted()).to.be.false()
  })
})

describe('bitswap without DHT', function () {
  this.timeout(20 * 1000)

  /** @type {{ libp2pNode: Libp2p, bitswap: Bitswap }[]} */
  let nodes

  before(async () => {
    nodes = await Promise.all([
      createThing(false),
      createThing(false),
      createThing(false)
    ])

    // connect 0 -> 1 && 1 -> 2
    const ma1 = `${nodes[1].libp2pNode.multiaddrs[0]}/p2p/${nodes[1].libp2pNode.peerId.toB58String()}`
    const ma2 = `${nodes[2].libp2pNode.multiaddrs[0]}/p2p/${nodes[2].libp2pNode.peerId.toB58String()}`

    await Promise.all([
      nodes[0].libp2pNode.dial(ma1),
      nodes[1].libp2pNode.dial(ma2)
    ])
  })

  after(async () => {
    await Promise.all(nodes.map((node) => Promise.all([
      node.bitswap.stop(),
      node.libp2pNode.stop()
    ])))
  })

  it('put a block in 2, fail to get it in 0', async () => {
    const finish = orderedFinish(2)

    const [block] = await makeBlock(1)
    await nodes[2].bitswap.put(block.cid, block.data)

    const node0Get = nodes[0].bitswap.get(block.cid)

    setTimeout(() => {
      finish(1)
      nodes[0].bitswap.unwant(block.cid)
    }, 200)

    await expect(node0Get).to.eventually.be.rejectedWith(/unwanted/)
    finish(2)

    finish.assert()
  })

  it('wants a block, receives a block, wants it again before the blockstore has it, receives it after the blockstore has it', async () => {
    // the block we want
    const [block] = await makeBlock(1)

    // id of a peer with the block we want
    const peerId = await PeerId.create({ bits: 512 })

    // incoming message with requested block from the other peer
    const message = new Message(false)
    message.addEntry(block.cid, 1, Message.WantType.Block)
    message.addBlock(block.cid, block.data)

    const mockBlockstore = {
      get: sinon.stub().withArgs(block.cid).throws({ code: 'ERR_NOT_FOUND' }),
      has: sinon.stub().withArgs(block.cid).returns(false),
      put: sinon.stub()
    }

    // slow blockstore
    // @ts-ignore not a complete implementation
    nodes[0].bitswap.blockstore = mockBlockstore

    // add the block to our want list
    const wantBlockPromise1 = nodes[0].bitswap.get(block.cid)

    // oh look, a peer has sent it to us - this will trigger a `blockstore.put` which
    // is an async operation so `self.blockstore.get(cid)` will still throw
    // until the write has completed
    await nodes[0].bitswap._receiveMessage(peerId, message)

    // block store did not have it
    expect(mockBlockstore.get.calledWith(block.cid)).to.be.true()

    // another context wants the same block
    const wantBlockPromise2 = nodes[0].bitswap.get(block.cid)

    // meanwhile the blockstore has written the block
    nodes[0].bitswap.blockstore.has = sinon.stub().withArgs(block.cid).returns(true)

    // here it comes again
    await nodes[0].bitswap._receiveMessage(peerId, message)

    // block store had it this time
    expect(mockBlockstore.get.calledWith(block.cid)).to.be.true()

    // both requests should get the block
    expect(await wantBlockPromise1).to.equalBytes(block.data)
    expect(await wantBlockPromise2).to.equalBytes(block.data)
  })
})

describe('bitswap with DHT', function () {
  this.timeout(20 * 1000)

  /** @type {{ libp2pNode: Libp2p, bitswap: Bitswap }[]} */
  let nodes

  before(async () => {
    nodes = await Promise.all([
      createThing(true),
      createThing(true),
      createThing(true)
    ])

    // connect 0 -> 1 && 1 -> 2
    const ma1 = `${nodes[1].libp2pNode.multiaddrs[0]}/p2p/${nodes[1].libp2pNode.peerId.toB58String()}`
    const ma2 = `${nodes[2].libp2pNode.multiaddrs[0]}/p2p/${nodes[2].libp2pNode.peerId.toB58String()}`

    await Promise.all([
      nodes[0].libp2pNode.dial(ma1),
      nodes[1].libp2pNode.dial(ma2)
    ])

    // await dht routing table are updated
    await Promise.all([
      pWaitFor(() => nodes[0].libp2pNode._dht.routingTable.size >= 1),
      pWaitFor(() => nodes[1].libp2pNode._dht.routingTable.size >= 2),
      pWaitFor(() => nodes[2].libp2pNode._dht.routingTable.size >= 1)
    ])
  })

  after(async () => {
    await Promise.all(nodes.map((node) => Promise.all([
      node.bitswap.stop(),
      node.libp2pNode.stop()
    ])))
  })

  it('put a block in 2, get it in 0', async () => {
    const [block] = await makeBlock(1)
    const provideSpy = sinon.spy(nodes[2].libp2pNode._dht, 'provide')
    await nodes[2].bitswap.put(block.cid, block.data)

    // wait for the DHT to finish providing
    await provideSpy.returnValues[0]

    const blockRetrieved = await nodes[0].bitswap.get(block.cid)
    expect(block.data).to.eql(blockRetrieved)
  })
})
