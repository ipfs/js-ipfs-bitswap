'use strict'

const async = require('async')
const store = require('idb-plus-blob-store')
const _ = require('lodash')
const IPFSRepo = require('ipfs-repo')

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

  const mainBlob = store(id)
  const blocksBlob = store(`${id}/blocks`)

  dbs.push(id)

  async.eachSeries(repoData, (file, cb) => {
    if (_.startsWith(file.key, 'datastore/')) {
      return cb()
    }

    const blocks = _.startsWith(file.key, 'blocks/')
    const blob = blocks ? blocksBlob : mainBlob

    const key = blocks ? file.key.replace(/^blocks\//, '') : file.key

    blob.createWriteStream({
      key: key
    }).end(file.value, cb)
  }, () => {
    const repo = new IPFSRepo(id, {stores: store})
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

require('./decision/engine-test')({
  create: createRepo,
  remove: removeRepos
})
