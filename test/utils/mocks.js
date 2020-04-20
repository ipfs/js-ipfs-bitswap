'use strict'

const range = require('lodash.range')

const PeerId = require('peer-id')

const PeerStore = require('libp2p/src/peer-store')
const Node = require('./create-libp2p-node').bundle
const tmpdir = require('ipfs-utils/src/temp-dir')
const Repo = require('ipfs-repo')
const EventEmitter = require('events')

const Bitswap = require('../../src')

/*
 * Create a mock libp2p node
 */
exports.mockLibp2pNode = () => {
  const peerId = PeerId.createFromHexString('122019318b6e5e0cf93a2314bf01269a2cc23cd3dcd452d742cdb9379d8646f6e4a9')

  return Object.assign(new EventEmitter(), {
    peerId,
    multiaddrs: [],
    handle () {},
    unhandle () {},
    contentRouting: {
      provide: async (cid) => {}, // eslint-disable-line require-await
      findProviders: async (cid, timeout) => { return [] } // eslint-disable-line require-await
    },
    connectionManager: {
      on () {},
      removeListener () {}
    },
    async  dial (peer) { // eslint-disable-line require-await
    },
    async dialProtocol (peer, protocol) { // eslint-disable-line require-await
      return {}
    },
    swarm: {
      setMaxListeners () {}
    },
    peerStore: new PeerStore()
  })
}

/*
 * Create a mock network instance
 */
exports.mockNetwork = (calls, done, onMsg) => {
  done = done || (() => {})

  const connects = []
  const messages = []
  let i = 0

  const finish = (msgTo) => {
    onMsg && onMsg(msgTo)
    if (++i === calls) {
      done({ connects: connects, messages: messages })
    }
  }

  return {
    messages,
    connects,
    connectTo (p) {
      setTimeout(() => {
        connects.push(p)
      })
    },
    sendMessage (p, msg) {
      messages.push([p, msg])

      setTimeout(() => {
        finish([p, msg])
      })

      return Promise.resolve()
    },
    start () {
      return Promise.resolve()
    },
    stop () {
      return Promise.resolve()
    },
    findAndConnect () {
      return Promise.resolve()
    },
    provide () {
      return Promise.resolve()
    }
  }
}

/*
 * Create a mock test network
 */
exports.createMockTestNet = async (repo, count) => {
  const results = await Promise.all([
    range(count).map((i) => repo.create(`repo-${i}`)),
    range(count).map((i) => PeerId.create({ bits: 512 }))
  ])

  const stores = results[0].map((r) => r.blockstore)
  const ids = results[1]

  const hexIds = ids.map((id) => id.toHexString())
  const bitswaps = range(count).map((i) => new Bitswap({}, stores[i]))
  const networks = range(count).map((i) => {
    return {
      connectTo (id) {
        return new Promise((resolve, reject) => {
          if (!hexIds.includes(hexIds, id.toHexString())) {
            return reject(new Error('unkown peer'))
          }
          resolve()
        })
      },
      sendMessage (id, msg) {
        const j = hexIds.findIndex((el) => el === id.toHexString())
        return bitswaps[j]._receiveMessage(ids[i], msg)
      },
      start () {
      }
    }
  })

  range(count).forEach((i) => {
    exports.applyNetwork(bitswaps[i], networks[i])
    bitswaps[i].start()
  })

  return {
    ids,
    stores,
    bitswaps,
    networks
  }
}

exports.applyNetwork = (bs, n) => {
  bs.network = n
  bs.wm.network = n
  bs.engine.network = n
}

/**
 * @private
 * @param {number} n The number of nodes in the network
 * @param {boolean} enableDHT Whether or not to run the dht
 */
exports.genBitswapNetwork = async (n, enableDHT = false) => {
  const netArray = [] // bitswap, peerStore, libp2p, peerId, repo

  // create PeerId and libp2p.Node for each
  const peers = await Promise.all(
    range(n).map(i => PeerId.create())
  )

  peers.forEach((p, i) => {
    const l = new Node({
      peerId: p,
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/0']
      },
      config: {
        dht: {
          enabled: enableDHT
        }
      }
    })
    netArray.push({ peerId: p, libp2p: l })
  })

  // create the repos
  const tmpDir = tmpdir()
  netArray.forEach((net, i) => {
    const repoPath = tmpDir + '/' + net.peerId.toB58String()
    net.repo = new Repo(repoPath)
  })

  await Promise.all(
    netArray.map(async (net) => {
      const repoPath = tmpDir + '/' + net.peerId.toB58String()
      net.repo = new Repo(repoPath)

      await net.repo.init({})
      await net.repo.open()
    })
  )

  // start every libp2pNode
  await Promise.all(
    netArray.map((net) => net.libp2p.start())
  )

  // create PeerStore and populate peerStore
  netArray.forEach((net, i) => {
    const pb = netArray[i].libp2p.peerStore
    netArray.forEach((net, j) => {
      if (i === j) {
        return
      }
      pb.addressBook.set(net.peerId, net.libp2p.multiaddrs)
    })
    netArray[i].peerStore = pb
  })

  // create every BitSwap
  netArray.forEach((net) => {
    net.bitswap = new Bitswap(net.libp2p, net.repo.blocks, net.peerStore)
  })

  return netArray
}
