'use strict'

// @ts-ignore
const IPFSRepo = require('ipfs-repo')
const pathJoin = require('path').join
const os = require('os')
// @ts-ignore
const ncp = require('ncp')
// @ts-ignore
const rimraf = require('rimraf')
// @ts-ignore
const promisify = require('promisify-es6')

const baseRepo = pathJoin(__dirname, '../fixtures/repo')
const asyncNcp = promisify(ncp)

async function createTempRepo () {
  const date = Date.now().toString()
  const path = pathJoin(os.tmpdir(), `bitswap-tests-${date}-${Math.random()}`)

  await asyncNcp(baseRepo, path)

  /** @type {import('ipfs-core-types/src/repo').Repo & { teardown: () => Promise<void>}} */
  const repo = new IPFSRepo(path)

  repo.teardown = async () => {
    await repo.close()
    await promisify(rimraf)(path)
  }

  await repo.open()

  return repo
}

module.exports = createTempRepo
