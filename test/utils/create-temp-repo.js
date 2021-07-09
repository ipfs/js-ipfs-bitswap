'use strict'

// @ts-ignore locks is not exported?
const { createRepo, locks: { memory } } = require('ipfs-repo')
const { MemoryDatastore } = require('interface-datastore')
const { MemoryBlockstore } = require('interface-blockstore')
const dagPb = require('@ipld/dag-pb')
const dagCbor = require('@ipld/dag-cbor')
const raw = require('multiformats/codecs/raw')

const CODECS = {
  [dagPb.code]: dagPb,
  [dagPb.name]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagCbor.name]: dagPb,
  [raw.code]: raw,
  [raw.name]: raw
}

async function createTempRepo () {
  const repo = createRepo(`bitswap-tests-${Math.random()}`, async (codeOrName) => {
    return CODECS[codeOrName]
  }, {
    root: new MemoryDatastore(),
    blocks: new MemoryBlockstore(),
    keys: new MemoryDatastore(),
    datastore: new MemoryDatastore(),
    pins: new MemoryDatastore()
  },
  {
    repoLock: memory
  })

  await repo.init({})
  await repo.open()

  return repo
}

module.exports = createTempRepo
