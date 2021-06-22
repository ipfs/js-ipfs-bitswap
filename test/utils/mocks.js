'use strict'

const PeerId = require('peer-id')

const PeerStore = require('libp2p/src/peer-store')
const Node = require('./create-libp2p-node').bundle
const tmpdir = require('ipfs-utils/src/temp-dir')
const Repo = require('ipfs-repo')
const { EventEmitter } = require('events')
const uint8ArrayToString = require('uint8arrays/to-string')
const { BlockstoreAdapter } = require('interface-blockstore')

const Bitswap = require('../../src')
const Network = require('../../src/network')
const Stats = require('../../src/stats')

/**
 * @typedef {import('interface-blockstore').Blockstore} BlockStore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('../../src/types/message')} Message
 * @typedef {import('multiformats/cid').CID} CID
 * @typedef {import('multiaddr').Multiaddr} Multiaddr
 * @typedef {import('libp2p')} Libp2p
 */

/**
 *
 * @returns {BlockStore}
 */
function mockBlockStore () {
  class MockBlockstore extends BlockstoreAdapter {
    constructor () {
      super()

      /** @type {Record<string, Uint8Array>} */
      this._blocks = {}
    }

    /**
     * @param {CID} cid
     */
    has (cid) {
      return Promise.resolve(Boolean(this._blocks[uint8ArrayToString(cid.multihash.bytes, 'base64')]))
    }

    /**
     * @param {CID} cid
     */
    get (cid) {
      return Promise.resolve(this._blocks[uint8ArrayToString(cid.multihash.bytes, 'base64')])
    }

    /**
     *
     * @param {CID} cid
     * @param {Uint8Array} data
     */
    put (cid, data) {
      this._blocks[uint8ArrayToString(cid.multihash.bytes, 'base64')] = data

      return Promise.resolve()
    }

    /**
     * @param {AsyncIterable<Pair> | Iterable<Pair>} source
     */
    async * putMany (source) {
      for await (const { key, value } of source) {
        this.put(key, value)

        yield { key, value }
      }
    }
  }

  return new MockBlockstore()
}

/**
 * Create a mock libp2p node
 *
 * @returns {import('libp2p')}
 */
exports.mockLibp2pNode = () => {
  const peerId = PeerId.createFromHexString('122019318b6e5e0cf93a2314bf01269a2cc23cd3dcd452d742cdb9379d8646f6e4a9')

  // @ts-ignore - not all libp2p fields are implemented
  return Object.assign(new EventEmitter(), {
    peerId,
    multiaddrs: [],
    handle () {},
    unhandle () {},
    registrar: {
      register () {},
      unregister () {}
    },
    contentRouting: {
      provide: async (/** @type {CID} */ cid) => {}, // eslint-disable-line require-await
      findProviders: async (/** @type {CID} */ cid, /** @type {number} **/ timeout) => { return [] } // eslint-disable-line require-await
    },
    connectionManager: {
      on () {},
      removeListener () {}
    },
    async dial (/** @type {PeerId} */ peer) { // eslint-disable-line require-await
    },
    async dialProtocol (/** @type {PeerId} */ peer, /** @type {string} */ protocol) { // eslint-disable-line require-await
      return {}
    },
    swarm: {
      setMaxListeners () {}
    },
    peerStore: new PeerStore({ peerId })
  })
}

/**
 * Create a mock network instance
 *
 * @param {number} [calls]
 * @param {function({ connects: (PeerId|Multiaddr)[], messages: [PeerId, Message][] }): void} [done]
 * @param {function(PeerId, Message): void} [onMsg]
 * @returns {import('../../src/network')}
 */
exports.mockNetwork = (calls = Infinity, done = () => {}, onMsg = () => {}) => {
  /** @type {(PeerId|Multiaddr)[]} */
  const connects = []
  /** @type {[PeerId, Message][]}} */
  const messages = []
  let i = 0

  /**
   * @param {PeerId} peerId
   * @param {Message} message
   */
  const finish = (peerId, message) => {
    onMsg && onMsg(peerId, message)

    if (++i === calls) {
      done && done({ connects: connects, messages: messages })
    }
  }

  class MockNetwork extends Network {
    constructor () {
      // @ts-ignore - {} is not an instance of libp2p
      super({}, new Bitswap({}, mockBlockStore()), new Stats())

      this.connects = connects
      this.messages = messages
    }

    /**
     * @param {PeerId|Multiaddr} p
     * @returns {Promise<import('libp2p').Connection>}
     */
    connectTo (p) {
      setTimeout(() => {
        connects.push(p)
      })

      // @ts-ignore not all connection fields are implemented
      return Promise.resolve({ id: '', remotePeer: '' })
    }

    /**
     * @param {PeerId} p
     * @param {Message} msg
     */
    sendMessage (p, msg) {
      messages.push([p, msg])

      setTimeout(() => {
        finish(p, msg)
      })

      return Promise.resolve()
    }

    start () {
      return Promise.resolve()
    }

    stop () {
      return Promise.resolve()
    }

    findAndConnect () {
      return Promise.resolve()
    }

    provide () {
      return Promise.resolve()
    }
  }

  // @ts-ignore
  return new MockNetwork()
}

/**
 * @param {Bitswap} bs
 * @param {Network} n
 */
exports.applyNetwork = (bs, n) => {
  bs.network = n
  bs.wm.network = n
  bs.engine.network = n
}

/**
 * @private
 * @param {number} n - The number of nodes in the network
 * @param {boolean} enableDHT - Whether or not to run the dht
 */
exports.genBitswapNetwork = async (n, enableDHT = false) => {
  /** @type {{ peerId: PeerId, libp2p: Libp2p, repo: Repo, peerStore: PeerStore, bitswap: Bitswap }[]} */
  const netArray = []

  // create PeerId and libp2p.Node for each
  const peers = await Promise.all(
    new Array(n).fill(0).map(() => PeerId.create())
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
    // @ts-ignore object is incomplete
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
    const pb = net.libp2p.peerStore
    netArray.forEach((net, j) => {
      if (i === j) {
        return
      }
      pb.addressBook.set(net.peerId, net.libp2p.multiaddrs)
    })
  })

  // create every Bitswap
  netArray.forEach((net) => {
    net.bitswap = new Bitswap(net.libp2p, net.repo.blocks)
  })

  return netArray
}
