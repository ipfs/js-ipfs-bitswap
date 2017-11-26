/* eslint-env mocha */
'use strict'

const map = require('async/map')
const each = require('async/each')
const eachOf = require('async/eachOf')
const parallel = require('async/parallel')
const _ = require('lodash')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')

const Message = require('../src/types/message')
const Bitswap = require('../src')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const createLibp2pNode = require('./utils/create-libp2p-node')
const makeBlock = require('./utils/make-block')

describe('bitswap stats', () => {
  const nodes = [0, 1]
  let libp2pNodes
  let repos
  let bitswaps
  let bs
  let blocks
  let ids

  before((done) => {
    parallel(
      {
        blocks: (cb) => map(_.range(15), (i, cb) => makeBlock(cb), cb),
        ids: (cb) => map(_.range(2), (i, cb) => PeerId.create({bits: 1024}, cb), cb)
      },
      (err, results) => {
        if (err) {
          return done(err)
        }

        blocks = results.blocks
        ids = results.ids

        done()
      }
    )
  })

  before((done) => {
    // create 2 temp repos
    map(nodes, (n, cb) => createTempRepo(cb), (err, _repos) => {
      expect(err).to.not.exist()
      repos = _repos
      done()
    })
  })

  before((done) => {
    // create 2 libp2p nodes
    map(nodes, (n, cb) => createLibp2pNode({
      DHT: repos[n].datastore
    }, cb), (err, _libp2pNodes) => {
      expect(err).to.not.exist()
      libp2pNodes = _libp2pNodes
      done()
    })
  })

  before(() => {
    bitswaps = nodes.map((node, i) => new Bitswap(libp2pNodes[i], repos[i].blocks, {
      statsUpdateInterval: 100 // fast update interval for so tests run fast
    }))
    bs = bitswaps[0]
  })

  // start the first bitswap
  before((done) => bs.start(done))

  after((done) => each(bitswaps, (bs, cb) => bs.stop(cb), done))

  after((done) => each(repos, (repo, cb) => repo.teardown(cb), done))

  after((done) => each(libp2pNodes, (n, cb) => n.stop(cb), done))

  it('has initial stats', () => {
    const stats = bs.stat().snapshot
    expect(stats).to.have.property('blocksReceived', 0)
    expect(stats).to.have.property('dataReceived', 0)
    expect(stats).to.have.property('dupBlksReceived', 0)
    expect(stats).to.have.property('dupDataReceived', 0)
    expect(stats).to.have.property('blocksSent', 0)
    expect(stats).to.have.property('dataSent', 0)
  })

  it('updates blocks received', (done) => {
    const stats = bs.stat()
    stats.once('update', (stats) => {
      expect(stats).to.have.property('blocksReceived', 2)
      expect(stats).to.have.property('dataReceived', 96)
      expect(stats).to.have.property('dupBlksReceived', 0)
      expect(stats).to.have.property('dupDataReceived', 0)
      expect(stats).to.have.property('blocksSent', 0)
      expect(stats).to.have.property('dataSent', 0)
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.slice(0, 2).forEach((block) => msg.addBlock(block))

    bs._receiveMessage(other, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  it('updates duplicate blocks counters', (done) => {
    const stats = bs.stat()
    stats.once('update', (stats) => {
      expect(stats).to.have.property('blocksReceived', 4)
      expect(stats).to.have.property('dataReceived', 192)
      expect(stats).to.have.property('dupBlksReceived', 2)
      expect(stats).to.have.property('dupDataReceived', 96)
      expect(stats).to.have.property('blocksSent', 0)
      expect(stats).to.have.property('dataSent', 0)
      done()
    })

    const other = ids[1]

    const msg = new Message(false)
    blocks.slice(0, 2).forEach((block) => msg.addBlock(block))

    bs._receiveMessage(other, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  describe('connected to another bitswap', () => {
    let bs2
    let block

    before((done) => {
      // parallel([
      //   (cb) => libp2pNodes[0].dial(libp2pNodes[1].peerInfo, cb),
      //   (cb) => libp2pNodes[1].dial(libp2pNodes[0].peerInfo, cb),
      //   ], done)
      eachOf(
        libp2pNodes,
        (node, i, cb) => node.dial(libp2pNodes[(i + 1) % nodes.length].peerInfo, cb),
        done)
    })

    before((done) => {
      bs2 = bitswaps[1]
      bs2.start(done)
    })

    after((done) => {
      bs2.stop(done)
    })

    before((done) => {
      makeBlock((err, _block) => {
        expect(err).to.not.exist()
        expect(_block).to.exist()
        block = _block
        done()
      })
    })

    before((done) => {
      bs.put(block, done)
    })

    it('updates stats on transfer', (done) => {
      const stats = bs.stat()
      stats.once('update', (stats) => {
        expect(stats).to.have.property('blocksReceived', 4)
        expect(stats).to.have.property('dataReceived', 192)
        expect(stats).to.have.property('dupBlksReceived', 2)
        expect(stats).to.have.property('dupDataReceived', 96)
        expect(stats).to.have.property('blocksSent', 1)
        expect(stats).to.have.property('dataSent', 48)
        done()
      })

      bs2.get(block.cid, (err, _block) => {
        expect(err).to.not.exist()
        expect(_block).to.exist()
      })
    })
  })
})
