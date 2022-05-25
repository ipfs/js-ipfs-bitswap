import { PersistentPeerStore } from '@libp2p/peer-store'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { EventEmitter } from 'events'
import { MemoryDatastore } from 'datastore-core/memory'
import { Bitswap } from '../../src/bitswap.js'
import { Network } from '../../src/network.js'
import { Stats } from '../../src/stats/index.js'
import { peerIdFromBytes } from '@libp2p/peer-id'
import { Components } from '@libp2p/interfaces/components'
import { createLibp2pNode } from './create-libp2p-node.js'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'

/**
 * @typedef {import('interface-blockstore').Blockstore} BlockStore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('../../src/message').BitswapMessage} Message
 * @typedef {import('multiformats/cid').CID} CID
 * @typedef {import('@multiformats/multiaddr').Multiaddr} Multiaddr
 * @typedef {import('libp2p').Libp2p} Libp2p
 * @typedef {import('@libp2p/interfaces/peer-id').PeerId} PeerId
 * @typedef {import('@libp2p/interfaces/peer-store').PeerStore} PeerStore
 */

/**
 * Create a mock libp2p node
 *
 * @returns {import('libp2p').Libp2p}
 */
export const mockLibp2pNode = () => {
  const buf = uint8ArrayFromString('122019318b6e5e0cf93a2314bf01269a2cc23cd3dcd452d742cdb9379d8646f6e4a9', 'base16')
  const peerId = peerIdFromBytes(buf)

  const libp2p = Object.assign(new EventEmitter(), {
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
    peerStore: new PersistentPeerStore({
      addressFilter: async () => true
    })
  })

  libp2p.peerStore.init(new Components({ peerId, datastore: new MemoryDatastore() }))

  // @ts-expect-error not all libp2p fields are implemented
  return libp2p
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
     * @returns {Promise<import('@libp2p/interfaces/connection').Connection>}
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
  // create PeerId and libp2p.Node for each
  const peers = await Promise.all(
    new Array(n).fill(0).map(() => createEd25519PeerId())
  )

  /** @type {{ libp2p: Libp2p, bitswap: Bitswap }[]} */
  const netArray = await Promise.all(
    peers.map(async (peerId, i) => {
      const libp2p = await createLibp2pNode({
        peerId,
        DHT: enableDHT
      })

      await libp2p.start()

      return {
        libp2p,
        bitswap: new Bitswap(libp2p, new MemoryBlockstore())
      }
    })
  )

  // populate peerStores
  for (let i = 0; i < netArray.length; i++) {
    const netA = netArray[i]

    for (let j = 0; j < netArray.length; j++) {
      if (i === j) {
        continue
      }

      const netB = netArray[j]

      await netA.libp2p.peerStore.addressBook.set(netB.libp2p.peerId, netB.libp2p.getMultiaddrs())
    }
  }

  return netArray
}
