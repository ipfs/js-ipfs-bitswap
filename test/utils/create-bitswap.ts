
import { DefaultBitswap } from '../../src/bitswap.js'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { createLibp2pNode } from './create-libp2p-node.js'
import type { Libp2p } from '@libp2p/interface-libp2p'
import type { Bitswap } from '../../src/index.js'

export const createBitswap = async (): Promise<{ bitswap: Bitswap, libp2pNode: Libp2p }> => {
  const libp2pNode = await createLibp2pNode({
    DHT: true
  })
  const bitswap = new DefaultBitswap(libp2pNode, new MemoryBlockstore())
  await bitswap.start()
  return { bitswap, libp2pNode }
}
