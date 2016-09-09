'use strict'

const eachSeries = require('async/eachSeries')
const Store = require('idb-pull-blob-store')
const _ = require('lodash')
const IPFSRepo = require('ipfs-repo')
const pull = require('pull-stream')

const repoContext = require.context('buffer!./test-repo', true)

const idb = window.indexedDB ||
        window.mozIndexedDB ||
        window.webkitIndexedDB ||
        window.msIndexedDB

// book keeping
const dbs = []

function createRepo (id, done) {
  const repoData = []
  repoContext.keys().forEach(function (key) {
    repoData.push({
      key: key.replace('./', ''),
      value: repoContext(key)
    })
  })

  const mainBlob = new Store(id)
  const blocksBlob = new Store(`${id}/blocks`)

  dbs.push(id)

  eachSeries(repoData, (file, cb) => {
    if (_.startsWith(file.key, 'datastore/')) {
      return cb()
    }

    const blocks = _.startsWith(file.key, 'blocks/')
    const blob = blocks ? blocksBlob : mainBlob

    const key = blocks ? file.key.replace(/^blocks\//, '') : file.key

    pull(
      pull.values([file.value]),
      blob.write(key, cb)
    )
  }, () => {
    const repo = new IPFSRepo(id, {stores: Store})
    done(null, repo)
  })
}

function removeRepos (done) {
  dbs.forEach((db) => {
    idb.deleteDatabase(db)
    idb.deleteDatabase(`${db}/blocks`)
  })
  done()
}

const repo = {
  create: createRepo,
  remove: removeRepos
}

require('./index-test')(repo)
require('./decision/engine-test')(repo)
