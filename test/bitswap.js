/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const delay = require('delay')
const PeerId = require('peer-id')
const sinon = require('sinon')

const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const orderedFinish = require('./utils/helpers').orderedFinish
const Message = require('../src/types/message')

// Creates a repo + libp2pNode + Bitswap with or without DHT
async function createThing (dht) {
  const repo = await createTempRepo()
  const libp2pNode = await createLibp2pNode({
    DHT: dht
  })
  const bitswap = new Bitswap(libp2pNode, repo.blocks)
  bitswap.start()
  return { repo, libp2pNode, bitswap }
}

describe('bitswap without DHT', function () {
  this.timeout(20 * 1000)

  let nodes

  before(async () => {
    nodes = await Promise.all([
      createThing(false),
      createThing(false),
      createThing(false)
    ])

    // connect 0 -> 1 && 1 -> 2
    await Promise.all([
      nodes[0].libp2pNode.dial(nodes[1].libp2pNode.peerInfo),
      nodes[1].libp2pNode.dial(nodes[2].libp2pNode.peerInfo)
    ])
  })

  after(async () => {
    await Promise.all(nodes.map((node) => Promise.all([
      node.bitswap.stop(),
      node.libp2pNode.stop(),
      node.repo.teardown()
    ])))
  })

  it('put a block in 2, fail to get it in 0', async () => {
    const finish = orderedFinish(2)

    const block = await makeBlock()
    await nodes[2].bitswap.put(block)

    const node0Get = nodes[0].bitswap.get(block.cid)

    setTimeout(() => {
      finish(1)
      nodes[0].bitswap.unwant(block.cid)
    }, 200)

    const b = await node0Get
    expect(b).to.not.exist()
    finish(2)

    finish.assert()
  })

  it('wants a block, receives a block, wants it again before the blockstore has it, receives it after the blockstore has it', async () => {
    // the block we want
    const block = await makeBlock()

    // id of a peer with the block we want
    const peerId = await PeerId.create({ bits: 512 })

    // incoming message with requested block from the other peer
    const message = new Message(false)
    message.addEntry(block.cid, 1, false)
    message.addBlock(block)

    // slow blockstore
    nodes[0].bitswap.blockstore = {
      has: sinon.stub().withArgs(block.cid).returns(false),
      put: sinon.stub()
    }

    // add the block to our want list
    const wantBlockPromise1 = nodes[0].bitswap.get(block.cid)

    // oh look, a peer has sent it to us - this will trigger a `blockstore.put` which
    // is an async operation so `self.blockstore.has(cid)` will still return false
    // until the write has completed
    await nodes[0].bitswap._receiveMessage(peerId, message)

    // block store did not have it
    expect(nodes[0].bitswap.blockstore.has.calledWith(block.cid)).to.be.true()

    // another context wants the same block
    const wantBlockPromise2 = nodes[0].bitswap.get(block.cid)

    // meanwhile the blockstore finishes it's batch
    nodes[0].bitswap.blockstore.has = sinon.stub().withArgs(block.cid).returns(true)

    // here it comes again
    await nodes[0].bitswap._receiveMessage(peerId, message)

    // block store had it this time
    expect(nodes[0].bitswap.blockstore.has.calledWith(block.cid)).to.be.true()

    // both requests should get the block
    expect(await wantBlockPromise1).to.deep.equal(block)
    expect(await wantBlockPromise2).to.deep.equal(block)
  })
})

describe('bitswap with DHT', function () {
  this.timeout(20 * 1000)

  let nodes

  before(async () => {
    nodes = await Promise.all([
      createThing(true),
      createThing(true),
      createThing(true)
    ])

    // connect 0 -> 1 && 1 -> 2
    await Promise.all([
      nodes[0].libp2pNode.dial(nodes[1].libp2pNode.peerInfo),
      nodes[1].libp2pNode.dial(nodes[2].libp2pNode.peerInfo)
    ])
  })

  after(async () => {
    await Promise.all(nodes.map((node) => Promise.all([
      node.bitswap.stop(),
      node.libp2pNode.stop(),
      node.repo.teardown()
    ])))
  })

  it('put a block in 2, get it in 0', async () => {
    const block = await makeBlock()
    nodes[2].bitswap.put(block)

    await nodes[2].bitswap.put(block)

    // Give put time to process
    await delay(100)

    const blockRetrieved = await nodes[0].bitswap.get(block.cid)
    expect(block.data).to.eql(blockRetrieved.data)
    expect(block.cid).to.eql(blockRetrieved.cid)
  })
})
