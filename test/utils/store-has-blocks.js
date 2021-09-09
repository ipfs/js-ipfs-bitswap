import { expect } from 'aegir/utils/chai.js'
import { CID } from 'multiformats/cid'

/**
 * @param {import('../../src/types/message').BitswapMessage} message
 * @param {import('interface-blockstore').Blockstore} store
 */
export async function storeHasBlocks (message, store) {
  for (const k of message.blocks.keys()) {
    expect(await store.has(CID.parse(k))).to.be.true('missing block')
  }
}
