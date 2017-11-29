'use strict'

const each = require('async/each')
const without = require('lodash.without')

module.exports = (nodes, callback) => {
  each(nodes, (node, cb) => {
    each(
      without(nodes, node),
      (otherNode, cb) => {
        node.libp2pNode.dial(otherNode.bitswap.peerInfo, cb)
      },
      cb)
  }, callback)
}
