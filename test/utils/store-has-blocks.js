'use strict'

const each = require('async/each')

function storeHasBlocks (message, store, callback) {
  each(message.blocks.values(), (b, callback) => {
    store.has(b.cid, (err, has) => {
      if (err) {
        return callback(err)
      }
      if (!has) {
        return callback(new Error('missing block'))
      }
      callback()
    })
  }, callback)
}

module.exports = storeHasBlocks
