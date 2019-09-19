/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
/* eslint-disable no-console */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const Block = require('ipfs-block')
const Buffer = require('safe-buffer').Buffer
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
      const b = Buffer.alloc(1024)
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
      const n = 2
      const nodeArr = await genBitswapNetwork(n)

      nodeArr.forEach((node) => {
        expect(
          Object.keys(node.libp2p._switch.conns)
        ).to.be.empty()

        // Parallel dials may result in 1 or 2 connections
        // depending on when they're executed.
        expect(
          Object.keys(node.libp2p._switch.connection.getAll())
        ).to.have.a.lengthOf.at.least(n - 1)
      })

      // -- actual test
      await round(nodeArr, n)
      await Promise.all(nodeArr.map(node => {
        node.bitswap.stop()
        return node.libp2p.stop()
      }))
    })
  })
})

async function round (nodeArr, n) {
  const blockFactor = 10
  const blocks = await createBlocks(n, blockFactor)

  const cids = blocks.map((b) => b.cid)

  // put blockFactor amount of blocks per node
  await Promise.all(nodeArr.map(async (node, i) => {
    node.bitswap.start()

    const data = range(blockFactor).map((j) => {
      const index = i * blockFactor + j
      return blocks[index]
    })

    await Promise.all(data.map((d) => node.bitswap.put(d)))
  }))

  const d = Date.now()

  // fetch all blocks on every node
  await Promise.all(nodeArr.map(async (node) => {
    const bs = await Promise.all(cids.map((cid) => node.bitswap.get(cid)))
    expect(bs).to.deep.equal(blocks)
  }))

  console.log('  time -- %s', (Date.now() - d))
}

function createBlocks (n, blockFactor) {
  return Promise.all([...new Array(n * blockFactor)].map(async (k) => {
    const d = crypto.randomBytes(n * blockFactor)
    const hash = await multihashing(d, 'sha2-256')
    return new Block(d, new CID(hash))
  }))
}
