import PeerId from 'peer-id'
import PeerStore from 'libp2p/src/peer-store/index.js'
import { Node } from './create-libp2p-node.js'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { EventEmitter } from 'events'
import { MemoryDatastore } from 'datastore-core/memory'
import { Bitswap } from '../../src/bitswap.js'
import { Network } from '../../src/network.js'
import { Stats } from '../../src/stats/index.js'

/**
 * @typedef {import('interface-blockstore').Blockstore} BlockStore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('../../src/message').BitswapMessage} Message
 * @typedef {import('multiformats/cid').CID} CID
 * @typedef {import('multiaddr').Multiaddr} Multiaddr
 * @typedef {import('libp2p')} Libp2p
 */

/**
 * Create a mock libp2p node
 *
 * @returns {import('libp2p')}
 */
export const mockLibp2pNode = () => {
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
    peerStore: new PeerStore({ peerId, datastore: new MemoryDatastore() })
  })
}

/**
 * Create a mock network instance
 *
 * @param {number} [calls]
 * @param {function({ connects: (PeerId|Multiaddr)[], messages: [PeerId, Message][] }): void} [done]
 * @param {function(PeerId, Message): void} [onMsg]
 * @returns {import('../../src/network').Network}
 */
export const mockNetwork = (calls = Infinity, done = () => {}, onMsg = () => {}) => {
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
      super({}, new Bitswap({}, new MemoryBlockstore()), new Stats({}))

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
export const applyNetwork = (bs, n) => {
  bs.network = n
  bs.wm.network = n
  bs.engine.network = n
}

/**
 * @private
 * @param {number} n - The number of nodes in the network
 * @param {boolean} enableDHT - Whether or not to run the dht
 */
export const genBitswapNetwork = async (n, enableDHT = false) => {
  /** @type {{ peerId: PeerId, libp2p: Libp2p, peerStore: PeerStore, bitswap: Bitswap }[]} */
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

  // start every libp2pNode
  await Promise.all(
    netArray.map((net) => net.libp2p.start())
  )

  // create PeerStore and populate peerStore
  for (let i = 0; i < netArray.length; i++) {
    const pb = netArray[i].libp2p.peerStore

    for (let j = 0; j < netArray.length; j++) {
      if (i === j) {
        continue
      }

      const net = netArray[j]

      await pb.addressBook.set(net.peerId, net.libp2p.multiaddrs)
    }
  }

  // create every Bitswap
  netArray.forEach((net) => {
    net.bitswap = new Bitswap(net.libp2p, new MemoryBlockstore())
  })

  return netArray
}
