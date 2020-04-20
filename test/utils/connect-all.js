'use strict'

const without = require('lodash.without')

module.exports = async (nodes) => {
  for (const node of nodes) {
    for (const otherNode of without(nodes, node)) {
      // TODO: set addrs
      await node.libp2pNode.dial(otherNode.bitswap.peerId)
    }
  }
}
