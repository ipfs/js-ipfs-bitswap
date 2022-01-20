
import { Bitswap } from '../../src/bitswap.js'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { createLibp2pNode } from './create-libp2p-node.js'

export const createBitswap = async () => {
  const libp2pNode = await createLibp2pNode({
    config: {
      dht: {
        enabled: true
      }
    }
  })
  const bitswap = new Bitswap(libp2pNode, new MemoryBlockstore())
  await bitswap.start()
  return { bitswap, libp2pNode }
}
