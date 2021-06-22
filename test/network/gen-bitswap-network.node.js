/* eslint-env mocha */
/* eslint-disable no-console */
'use strict'

const { expect } = require('aegir/utils/chai')
const makeBlocks = require('../utils/make-blocks')

const genBitswapNetwork = require('../utils/mocks').genBitswapNetwork

describe('gen Bitswap network', function () {
  // CI is very slow
  this.timeout(300 * 1000)

  it('retrieves local blocks', async () => {
    const nodes = await genBitswapNetwork(1)

    const node = nodes[0]
    const blocks = await makeBlocks(100)

    await Promise.all(blocks.map(b => node.bitswap.put(b.cid, b.data)))
    const res = await Promise.all(new Array(100).fill(0).map((_, i) => {
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
  const blocks = await makeBlocks(nodes.length * blocksPerNode)

  const cids = blocks.map((b) => b.cid)

  // put blocksPerNode amount of blocks per node
  await Promise.all(nodes.map(async (node, i) => {
    node.bitswap.start()

    const data = new Array(blocksPerNode).fill(0).map((_, j) => {
      const index = i * blocksPerNode + j
      return blocks[index]
    })

    await Promise.all(data.map((d) => node.bitswap.put(d.cid, d.data)))
  }))

  const d = Date.now()

  // fetch all blocks on every node
  await Promise.all(nodes.map(async (node) => {
    const bs = await Promise.all(cids.map((cid) => node.bitswap.get(cid)))
    expect(bs).to.deep.equal(blocks.map(b => b.data))
  }))

  console.log('  time -- %s', (Date.now() - d))
}
