/* global self */
'use strict'

// @ts-ignore
const IPFSRepo = require('ipfs-repo')

// @ts-ignore
const idb = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB

async function createTempRepo () {
  const date = Date.now().toString()
  const path = `/bitswap-tests-${date}-${Math.random()}`

  /** @type {import('ipfs-core-types/src/repo').Repo & { teardown: () => void}} */
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
