'use strict'

/** @type {(n:number) => any[]} */
// @ts-ignore
const range = require('lodash.range')
const { expect } = require('aegir/utils/chai')

const createBitswap = require('./create-bitswap')
const makeBlock = require('./make-blocks')
const connectAll = require('./connect-all')
const all = require('it-all')

/**
 *
 * @param {number} instanceCount
 * @param {number} blockCount
 * @param {number} repeats
 * @param {*} events
 */
module.exports = async (instanceCount, blockCount, repeats, events) => {
  let pendingRepeats = repeats

  const nodes = await Promise.all(range(instanceCount).map(() => createBitswap()))
  events.emit('start')

  await connectAll(nodes)

  events.emit('all connected')

  while (pendingRepeats > 0) {
    const first = nodes[0]
    const blocks = await makeBlock(blockCount)

    await Promise.all(
      blocks.map(block => first.bitswap.put(block.cid, block.data))
    )

    events.emit('first put')

    const results = await Promise.all(
      nodes.map(async node => {
        events.emit('getting many')

        const cids = blocks.map((block) => block.cid)
        const start = Date.now()
        const result = await node.bitswap.getMany(cids)
        const elapsed = Date.now() - start
        events.emit('got block', elapsed)

        return result
      })
    )

    try {
      expect(results).have.lengthOf(instanceCount)

      for (const result of results) {
        const nodeBlocks = await all(result)
        expect(nodeBlocks).to.have.lengthOf(blocks.length)
        nodeBlocks.forEach((block, i) => {
          expect(block).to.deep.equal(blocks[i].data)
        })
      }
    } finally {
      pendingRepeats--
    }
  }

  events.emit('stop')

  await Promise.all(
    nodes.map(async node => {
      await node.bitswap.stop()
      await node.libp2pNode.stop()
    })
  )

  events.emit('stopped')
}
