import { expectType } from 'tsd'
import type { IPFSBitswap } from '../'
import { createBitswap } from '../'
import { MemoryBlockstore } from 'interface-blockstore'
import { create as createLibp2p } from 'libp2p'

expectType<IPFSBitswap>(createBitswap(
  await createLibp2p({
    modules: {
      transport: [],
      streamMuxer: [],
      connEncryption: []
    }
  }),
  new MemoryBlockstore()
))
