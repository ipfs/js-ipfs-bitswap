'use strict'

const IPFSRepo = require('ipfs-repo')
const pathJoin = require('path').join
const os = require('os')
const rimraf = require('rimraf')
const promisify = require('promisify-es6')

async function createTempRepo () {
  const date = Date.now().toString()
  const path = pathJoin(os.tmpdir(), `bitswap-tests-${date}-${Math.random()}`)
  const repo = new IPFSRepo(path)

  repo.teardown = async () => {
    await repo.close()
    await promisify(rimraf)(path)
  }

  await repo.init({})
  await repo.open()

  return repo
}

module.exports = createTempRepo
