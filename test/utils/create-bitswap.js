'use strict'

const Bitswap = require('../..')
const createTempRepo = require('./create-temp-repo-nodejs')
const createLibp2pNode = require('./create-libp2p-node')

module.exports = async () => {
  const repo = await createTempRepo()
  const libp2pNode = await createLibp2pNode({
    DHT: repo.datastore
  })
  const bitswap = new Bitswap(libp2pNode, repo.blocks)
  bitswap.start()
  return { bitswap, repo, libp2pNode }
}
