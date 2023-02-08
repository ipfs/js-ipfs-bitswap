import { expect } from 'aegir/chai'
import type { Blockstore } from 'blockstore-core/dist/src/base'
import { CID } from 'multiformats/cid'
import type { BitswapMessage } from '../../src/message'

export async function storeHasBlocks (message: BitswapMessage, store: Blockstore) {
  for (const k of message.blocks.keys()) {
    expect(await store.has(CID.parse(k))).to.be.true('missing block')
  }
}
