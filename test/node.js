'use strict'

const IPFSRepo = require('ipfs-repo')
const path = require('path')
const ncp = require('ncp')
const rimraf = require('rimraf')
const fs = require('fs-blob-store')
const testRepoPath = path.join(__dirname, 'test-repo')
const async = require('async')

// book keeping
const repos = []

function createRepo (id, done) {
  const date = Date.now().toString()
  const repoPath = `${testRepoPath}-for-${date}-${id}`
  ncp(testRepoPath, repoPath, (err) => {
    if (err) return done(err)

    const repo = new IPFSRepo(repoPath, {stores: fs})
    repos.push(repoPath)
    done(null, repo)
  })
}

function removeRepos (done) {
  async.each(repos, (repo, cb) => {
    rimraf(repo, cb)
  }, done)
}

require('./decision/engine-test')({
  create: createRepo,
  remove: removeRepos
})
