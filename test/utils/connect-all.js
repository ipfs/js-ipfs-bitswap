'use strict'

// @ts-ignore
const without = require('lodash.without')

/**
 * @param {any[]} nodes
 */
module.exports = async (nodes) => {
  for (const node of nodes) {
    for (const otherNode of without(nodes, node)) {
      await node.libp2pNode.dial(otherNode.bitswap.peerId)
    }
  }
}
