/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const promisify = require('promisify-es6')

const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const orderedFinish = require('./utils/helpers').orderedFinish

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
  })

  after(async () => {
    await Promise.all(nodes.map(async (node) => {
      node.bitswap.stop()
      await promisify(node.libp2pNode.stop.bind(node.libp2pNode))()
      await node.repo.teardown()
    }))
  })

  it('connect 0 -> 1 && 1 -> 2', async () => {
    await Promise.all([
      promisify(nodes[0].libp2pNode.dial.bind(nodes[0].libp2pNode))(nodes[1].libp2pNode.peerInfo),
      promisify(nodes[1].libp2pNode.dial.bind(nodes[1].libp2pNode))(nodes[2].libp2pNode.peerInfo)
    ])
  })

  it('put a block in 2, fail to get it in 0', async (done) => {
    const finish = orderedFinish(2, done)

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
  })

  after(async () => {
    await Promise.all(nodes.map(async (node) => {
      node.bitswap.stop()
      await promisify(node.libp2pNode.stop.bind(node.libp2pNode))()
      await node.repo.teardown()
    }))
  })

  it('connect 0 -> 1 && 1 -> 2', async () => {
    await Promise.all([
      promisify(nodes[0].libp2pNode.dial.bind(nodes[0].libp2pNode))(nodes[1].libp2pNode.peerInfo),
      promisify(nodes[1].libp2pNode.dial.bind(nodes[1].libp2pNode))(nodes[2].libp2pNode.peerInfo)
    ])
  })

  it('put a block in 2, get it in 0', async () => {
    const block = await makeBlock()
    nodes[2].bitswap.put(block)
    // await promisify(nodes[2].bitswap.put.bind(nodes[2].bitswap))(block)

    const blockRetrieved = await nodes[0].bitswap.get(block.cid)
    expect(block.data).to.eql(blockRetrieved.data)
    expect(block.cid).to.eql(blockRetrieved.cid)
  })
})
