'use strict'

const { expect } = require('aegir/utils/chai')

async function storeHasBlocks (message, store) {
  for (const b of message.blocks.values()) {
    expect(await store.has(b.cid)).to.be.true('missing block')
  }
}

module.exports = storeHasBlocks
