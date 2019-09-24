'use strict'

const IPFSRepo = require('ipfs-repo')
const pathJoin = require('path').join
const os = require('os')
const ncp = require('ncp')
const rimraf = require('rimraf')
const promisify = require('promisify-es6')

const baseRepo = pathJoin(__dirname, '../fixtures/repo')

async function createTempRepo () {
  const date = Date.now().toString()
  const path = pathJoin(os.tmpdir(), `bitswap-tests-${date}-${Math.random()}`)

  await promisify(ncp)(baseRepo, path)

  const repo = new IPFSRepo(path)

  repo.teardown = async () => {
    await repo.close()
    await promisify(rimraf)(path)
  }

  await repo.open()

  return repo
}

module.exports = createTempRepo
