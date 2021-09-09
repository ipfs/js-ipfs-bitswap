
// @ts-ignore
import without from 'lodash.without'

/**
 * @param {any[]} nodes
 */
export const connectAll = async (nodes) => {
  for (const node of nodes) {
    for (const otherNode of without(nodes, node)) {
      await node.libp2pNode.dial(otherNode.bitswap.peerId)
    }
  }
}
