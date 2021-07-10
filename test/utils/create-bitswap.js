'use strict'

const Bitswap = require('../../src/bitswap')
const { MemoryBlockstore } = require('interface-blockstore')
const createLibp2pNode = require('./create-libp2p-node')

module.exports = async () => {
  const libp2pNode = await createLibp2pNode({
    config: {
      dht: {
        enabled: true
      }
    }
  })
  const bitswap = new Bitswap(libp2pNode, new MemoryBlockstore())
  bitswap.start()
  return { bitswap, libp2pNode }
}
