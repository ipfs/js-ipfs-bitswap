'use strict'

const IPFSRepo = require('ipfs-repo')
const path = require('path')
const ncp = require('ncp')
const rimraf = require('rimraf')

const baseRepo = path.join(__dirname, '../fixtures/repo')

function createTempRepo (callback) {
  const date = Date.now().toString()
  const path = `/tmp/bitswap-tests-${date}-${Math.random()}`

  ncp(baseRepo, path, (err) => {
    if (err) { return callback(err) }

    const repo = new IPFSRepo(path)

    repo.teardown = (callback) => rimraf(path, callback)

    repo.open((err) => {
      if (err) { return callback(err) }
      callback(null, repo)
    })
  })
}

module.exports = createTempRepo
