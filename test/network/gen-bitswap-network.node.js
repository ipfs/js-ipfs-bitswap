/* eslint-env mocha */
/* eslint-disable no-console */
'use strict'

const { expect } = require('aegir/utils/chai')
const Block = require('ipld-block')
const crypto = require('crypto')
const CID = require('cids')
const multihashing = require('multihashing-async')
const range = require('lodash.range')

const genBitswapNetwork = require('../utils/mocks').genBitswapNetwork

describe('gen Bitswap network', function () {
  // CI is very slow
  this.timeout(300 * 1000)

  it('retrieves local blocks', async () => {
    const nodes = await genBitswapNetwork(1)

    const node = nodes[0]
    const blocks = await Promise.all(range(100).map(async (k) => {
      const b = new Uint8Array(1024)
      b.fill(k)
      const hash = await multihashing(b, 'sha2-256')
      const cid = new CID(hash)
      return new Block(b, cid)
    }))

    await Promise.all(blocks.map(b => node.bitswap.put(b)))
    const res = await Promise.all(range(100).map((i) => {
      return node.bitswap.get(blocks[i].cid)
    }))
    expect(res).to.have.length(blocks.length)

    node.bitswap.stop()
    await node.libp2p.stop()
  })

  describe('distributed blocks', () => {
    it('with 2 nodes', async () => {
      const numNodes = 2
      const blocksPerNode = 10
      const nodeArr = await genBitswapNetwork(numNodes)

      // -- actual test
      await exchangeBlocks(nodeArr, blocksPerNode)
      await Promise.all(nodeArr.map(node => {
        node.bitswap.stop()
        return node.libp2p.stop()
      }))
    })
  })
})

/**
 * @private
 * @param {Array<*>} nodes - Array of Bitswap Network nodes
 * @param {number} blocksPerNode - Number of blocks to exchange per node
 */
async function exchangeBlocks (nodes, blocksPerNode = 10) {
  const blocks = await createBlocks(nodes.length * blocksPerNode)

  const cids = blocks.map((b) => b.cid)

  // put blocksPerNode amount of blocks per node
  await Promise.all(nodes.map(async (node, i) => {
    node.bitswap.start()

    const data = range(blocksPerNode).map((j) => {
      const index = i * blocksPerNode + j
      return blocks[index]
    })

    await Promise.all(data.map((d) => node.bitswap.put(d)))
  }))

  const d = Date.now()

  // fetch all blocks on every node
  await Promise.all(nodes.map(async (node) => {
    const bs = await Promise.all(cids.map((cid) => node.bitswap.get(cid)))
    expect(bs).to.deep.equal(blocks)
  }))

  console.log('  time -- %s', (Date.now() - d))
}

/**
 * Resolves `num` blocks
 *
 * @private
 * @param {number} num - The number of blocks to create
 * @returns {Promise<Block[]>}
 */
function createBlocks (num) {
  return Promise.all([...new Array(num)].map(async () => {
    const d = crypto.randomBytes(num)
    const hash = await multihashing(d, 'sha2-256')
    return new Block(d, new CID(hash))
  }))
}
