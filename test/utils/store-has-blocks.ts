import { expect } from 'aegir/chai'
import { CID } from 'multiformats/cid'
import type { BitswapMessage } from '../../src/message'
import type { Blockstore } from 'interface-blockstore'

export async function storeHasBlocks (message: BitswapMessage, store: Blockstore): Promise<void> {
  for (const k of message.blocks.keys()) {
    expect(await store.has(CID.parse(k))).to.be.true('missing block')
  }
}
