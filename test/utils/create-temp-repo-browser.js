/* global self */
'use strict'

const IPFSRepo = require('ipfs-repo')

const idb = self.indexedDB ||
  self.mozIndexedDB ||
  self.webkitIndexedDB ||
  self.msIndexedDB

async function createTempRepo () {
  const date = Date.now().toString()
  const path = `/bitswap-tests-${date}-${Math.random()}`

  const repo = new IPFSRepo(path)
  await repo.init({})
  await repo.open()

  repo.teardown = () => {
    idb.deleteDatabase(path)
    idb.deleteDatabase(`${path}/blocks`)
  }

  return repo
}

module.exports = createTempRepo
