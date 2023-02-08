
/** @type {(n:number) => any[]} */
// @ts-expect-error no types
import range from 'lodash.range'
import { expect } from 'aegir/chai'
import { createBitswap } from './create-bitswap.js'
import { makeBlocks } from './make-blocks.js'
import { connectAll } from './connect-all.js'
import all from 'it-all'
import type { Libp2p } from '@libp2p/interface-libp2p'
import type { IPFSBitswap } from '../../src/index.js'

export const distributionTest = async (instanceCount: number, blockCount: number, repeats: number, events: any) => {
  let pendingRepeats = repeats

  const nodes: Array<{ libp2pNode: Libp2p, bitswap: IPFSBitswap }> = await Promise.all(range(instanceCount).map(() => createBitswap()))
  events.emit('start')

  await connectAll(nodes)

  events.emit('all connected')

  while (pendingRepeats > 0) {
    const first = nodes[0]
    const blocks = await makeBlocks(blockCount)

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
