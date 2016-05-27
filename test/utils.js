'use strict'

const async = require('async')
const _ = require('lodash')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const PeerBook = require('peer-book')
const multiaddr = require('multiaddr')
const Bitswap = require('../src')
const libp2p = require('libp2p-ipfs')
const os = require('os')
const Repo = require('ipfs-repo')
const bs = require('abstract-blob-store')
// const bs = require('fs-blob-store')

exports.mockNetwork = (calls, done) => {
  done = done || (() => {})
  const connects = []
  const messages = []
  let i = 0

  const finish = () => {
    i++
    if (i === calls) {
      done({connects, messages})
    }
  }

  return {
    connectTo (p, cb) {
      async.setImmediate(() => {
        connects.push(p)
        cb()
      })
    },
    sendMessage (p, msg, cb) {
      async.setImmediate(() => {
        messages.push([p, msg])
        cb()
        finish()
      })
    },
    start () {
    }
  }
}

exports.createMockNet = (repo, count, cb) => {
  async.map(_.range(count), (i, cb) => repo.create(`repo-${i}`, (err, res) => {
    if (err) return cb(err)
    cb(null, res.datastore)
  }), (err, stores) => {
    if (err) return cb(err)

    const ids = _.range(count).map((i) => PeerId.create({bits: 64}))
    const hexIds = ids.map((id) => id.toHexString())
    const bitswaps = _.range(count).map((i) => new Bitswap(ids[i], {}, stores[i]))
    const networks = _.range(count).map((i) => {
      return {
        connectTo (id, cb) {
          const done = (err) => async.setImmediate(() => cb(err))
          if (!_.includes(hexIds, id.toHexString())) {
            return done(new Error('unkown peer'))
          }
          done()
        },
        sendMessage (id, msg, cb) {
          const j = _.findIndex(hexIds, (el) => el === id.toHexString())
          bitswaps[j]._receiveMessage(ids[i], msg, cb)
        },
        start () {
        }
      }
    })

    _.range(count).forEach((i) => {
      exports.applyNetwork(bitswaps[i], networks[i])
      bitswaps[i].start()
    })

    cb(null, {
      ids,
      stores,
      bitswaps,
      networks
    })
  })
}

exports.applyNetwork = (bs, n) => {
  bs.network = n
  bs.wm.network = n
  bs.engine.network = n
}

exports.genBitswapNetwork = (n, callback) => {
  const netArray = [] // bitswap, peerBook, libp2p, peerInfo, repo
  const basePort = 12000

  // create PeerInfo and libp2p.Node for each
  _.range(n).forEach((i) => {
    const p = new PeerInfo()
    const mh1 = multiaddr('/ip4/127.0.0.1/tcp/' + (basePort + i))
    const mh2 = multiaddr('/ip4/127.0.0.1/tcp/' + (basePort + i + 2000) + '/ws')

    p.multiaddr.add(mh1)
    p.multiaddr.add(mh2)

    const l = new libp2p.Node(p)
    netArray.push({peerInfo: p, libp2p: l})
  })

  // create PeerBook and populate peerBook
  netArray.forEach((net, i) => {
    const pb = new PeerBook()
    netArray.forEach((net, j) => {
      if (i === j) {
        return
      }
      pb.put(net.peerInfo)
    })
    netArray[i].peerBook = pb
  })

  // create the repos
  const tmpDir = os.tmpdir()
  netArray.forEach((net, i) => {
    const repoPath = tmpDir + '/' + net.peerInfo.id.toB58String()
    net.repo = new Repo(repoPath, { stores: bs })
  })

  // start every libp2pNode
  async.each(netArray, (net, cb) => {
    net.libp2p.start(cb)
  }, (err) => {
    if (err) {
      throw err
    }
    createBitswaps()
  })

  // create every BitSwap
  function createBitswaps () {
    netArray.forEach((net) => {
      net.bitswap = new Bitswap(net.peerInfo, net.libp2p, net.repo, net.peerBook)
    })
    establishLinks()
  }

  // connect all the nodes between each other
  function establishLinks () {
    async.eachSeries(netArray, (from, cbI) => {
      async.eachSeries(netArray, (to, cbJ) => {
        if (from.peerInfo.id.toB58String() ===
            to.peerInfo.id.toB58String()) {
          return cbJ()
        }
        from.libp2p.swarm.dial(to.peerInfo, cbJ)
      }, (err) => {
        if (err) {
          throw err
        }
        cbI()
      })
    }, (err) => {
      if (err) {
        throw err
      }
      finish()
    })
  }

  // callback with netArray
  function finish () {
    callback(null, netArray)
  }
}

