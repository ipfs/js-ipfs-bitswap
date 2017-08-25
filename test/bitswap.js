/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const waterfall = require('async/waterfall')
const series = require('async/series')
const each = require('async/each')
const parallel = require('async/parallel')

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')
const orderedFinish = require('./utils/helpers').orderedFinish

// Creates a repo + libp2pNode + Bitswap with or without DHT
function createThing (dht, callback) {
  waterfall([
    (cb) => createTempRepo(cb),
    (repo, cb) => {
      createLibp2pNode({
        DHT: dht ? repo.datastore : undefined
      }, (err, node) => cb(err, repo, node))
    },
    (repo, libp2pNode, cb) => {
      const bitswap = new Bitswap(libp2pNode, repo.blocks)
      bitswap.start((err) => cb(err, repo, libp2pNode, bitswap))
    }
  ], (err, repo, libp2pNode, bitswap) => {
    expect(err).to.not.exist()

    callback(null, {
      repo: repo,
      libp2pNode: libp2pNode,
      bitswap: bitswap
    })
  })
}

describe('bitswap without DHT', function () {
  this.timeout(20 * 1000)

  let nodes

  before((done) => {
    parallel([
      (cb) => createThing(false, cb),
      (cb) => createThing(false, cb),
      (cb) => createThing(false, cb)
    ], (err, results) => {
      expect(err).to.not.exist()
      expect(results).to.have.length(3)
      nodes = results
      done()
    })
  })

  after((done) => {
    each(nodes, (node, cb) => {
      series([
        (cb) => node.bitswap.stop(cb),
        (cb) => node.libp2pNode.stop(cb),
        (cb) => node.repo.teardown(cb)
      ], cb)
    }, done)
  })

  it('connect 0 -> 1 && 1 -> 2', (done) => {
    parallel([
      (cb) => nodes[0].libp2pNode.dial(nodes[1].libp2pNode.peerInfo, cb),
      (cb) => nodes[1].libp2pNode.dial(nodes[2].libp2pNode.peerInfo, cb)
    ], done)
  })

  it('put a block in 2, fail to get it in 0', (done) => {
    const finish = orderedFinish(2, done)

    waterfall([
      (cb) => makeBlock(cb),
      (block, cb) => nodes[2].bitswap.put(block, () => cb(null, block))
    ], (err, block) => {
      expect(err).to.not.exist()
      nodes[0].bitswap.get(block.cid, (err, block) => {
        expect(err).to.not.exist()
        expect(block).to.not.exist()
        finish(2)
      })

      setTimeout(() => {
        finish(1)
        nodes[0].bitswap.unwant(block.cid)
      }, 200)
    })
  })
})

describe('bitswap with DHT', () => {
  let nodes

  before((done) => {
    parallel([
      (cb) => createThing(true, cb),
      (cb) => createThing(true, cb),
      (cb) => createThing(true, cb)
    ], (err, results) => {
      expect(err).to.not.exist()
      expect(results).to.have.length(3)
      nodes = results
      done()
    })
  })

  after((done) => {
    each(nodes, (node, cb) => {
      series([
        (cb) => node.bitswap.stop(cb),
        (cb) => node.libp2pNode.stop(cb),
        (cb) => node.repo.teardown(cb)
      ], cb)
    }, done)
  })

  it('connect 0 -> 1 && 1 -> 2', (done) => {
    parallel([
      (cb) => nodes[0].libp2pNode.dial(nodes[1].libp2pNode.peerInfo, cb),
      (cb) => nodes[1].libp2pNode.dial(nodes[2].libp2pNode.peerInfo, cb)
    ], done)
  })

  it('put a block in 2, get it in 0', (done) => {
    waterfall([
      (cb) => makeBlock(cb),
      (block, cb) => nodes[2].bitswap.put(block, () => cb(null, block)),
      (block, cb) => setTimeout(() => cb(null, block), 400),
      (block, cb) => nodes[0].bitswap.get(block.cid, (err, blockRetrieved) => {
        expect(err).to.not.exist()
        expect(block.data).to.eql(blockRetrieved.data)
        expect(block.cid).to.eql(blockRetrieved.cid)
        cb()
      })
    ], done)
  })
})
