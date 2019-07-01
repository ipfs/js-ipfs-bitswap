'use strict'

const promisify = require('promisify-es6')
const without = require('lodash.without')

module.exports = async (nodes) => {
  for (const node of nodes) {
    for (const otherNode of without(nodes, node)) {
      await promisify(node.libp2pNode.dial.bind(node.libp2pNode))(otherNode.bitswap.peerInfo)
    }
  }
}
