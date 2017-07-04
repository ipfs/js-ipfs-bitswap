/* global self */
'use strict'

const IPFSRepo = require('ipfs-repo')
const series = require('async/series')

const idb = self.indexedDB ||
  self.mozIndexedDB ||
  self.webkitIndexedDB ||
  self.msIndexedDB

// book keeping
let dbs = []

function createRepo (id, done) {
  dbs.push(id)

  const repo = new IPFSRepo(id)
  series([
    (cb) => repo.init({}, cb),
    (cb) => repo.open(cb)
  ], (err) => {
    if (err) {
      return done(err)
    }
    done(null, repo)
  })
}

function removeRepos (done) {
  dbs.forEach((db) => {
    idb.deleteDatabase(db)
    idb.deleteDatabase(`${db}/blocks`)
  })
  dbs = []
  done()
}

const repo = {
  create: createRepo,
  remove: removeRepos
}

require('./index-test')(repo)
require('./components/decision-engine/index-test')(repo)
