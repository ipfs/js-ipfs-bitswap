'use strict'

const { expect } = require('aegir/utils/chai')
const { CID } = require('multiformats/cid')

/**
 * @param {import('../../src/types/message')} message
 * @param {import('interface-blockstore').Blockstore} store
 */
async function storeHasBlocks (message, store) {
  for (const k of message.blocks.keys()) {
    expect(await store.has(CID.parse(k))).to.be.true('missing block')
  }
}

module.exports = storeHasBlocks
