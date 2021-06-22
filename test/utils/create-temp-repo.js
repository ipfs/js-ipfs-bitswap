'use strict'

const IPFSRepo = require('ipfs-repo')
const { MemoryDatastore } = require('interface-datastore')

async function createTempRepo () {
  // const date = Date.now().toString()
  // const path = pathJoin(os.tmpdir(), `bitswap-tests-${date}-${Math.random()}`)
  const repo = new IPFSRepo(`bitswap-tests-${Math.random()}`, {
    lock: 'memory',
    storageBackends: {
      root: MemoryDatastore,
      blocks: MemoryDatastore,
      keys: MemoryDatastore,
      datastore: MemoryDatastore,
      pins: MemoryDatastore
    }
  })

  await repo.init({})
  await repo.open()

  return repo
}

module.exports = createTempRepo
