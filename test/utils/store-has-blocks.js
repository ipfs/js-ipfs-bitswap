'use strict'

function storeHasBlocks (message, store) {
  return Promise.all((message.blocks.values().map(async (b) => {
    const has = await store.has(b.cid)
    if (!has) {
      throw new Error('missing block')
    }
  })))
}

module.exports = storeHasBlocks
