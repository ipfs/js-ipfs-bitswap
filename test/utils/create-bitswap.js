'use strict'

const Bitswap = require('../../src')
const createTempRepo = require('./create-temp-repo')
const createLibp2pNode = require('./create-libp2p-node')

module.exports = async () => {
  const repo = await createTempRepo()
  const libp2pNode = await createLibp2pNode({
    datastore: repo.datastore,
    config: {
      dht: {
        enabled: true
      }
    }
  })
  const bitswap = new Bitswap(libp2pNode, repo.blocks)
  bitswap.start()
  return { bitswap, repo, libp2pNode }
}
