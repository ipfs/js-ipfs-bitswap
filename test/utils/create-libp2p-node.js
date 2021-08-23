'use strict'

// @ts-ignore
const TCP = require('libp2p-tcp')
// @ts-ignore
const MPLEX = require('libp2p-mplex')
const { NOISE } = require('@chainsafe/libp2p-noise')
const Libp2p = require('libp2p')
const KadDHT = require('libp2p-kad-dht')
const PeerId = require('peer-id')
// @ts-ignore
const defaultsDeep = require('@nodeutils/defaults-deep')

/**
 * @typedef {Partial<import('libp2p').Libp2pOptions> & Partial<import('libp2p').constructorOptions> & { DHT?: boolean}} NodeOptions
 */

class Node extends Libp2p {
  /**
   * @param {NodeOptions} _options
   */
  constructor (_options) {
    const defaults = {
      modules: {
        transport: [
          TCP
        ],
        streamMuxer: [
          MPLEX
        ],
        connEncryption: [
          NOISE
        ],
        dht: KadDHT
      },
      config: {
        dht: {
          enabled: Boolean(_options.DHT)
        }
      }
    }

    delete _options.DHT
    super(defaultsDeep(_options, defaults))
  }
}

/**
 * @param {NodeOptions} [options]
 *
 * @returns {Promise<Libp2p>}
 */
async function createLibp2pNode (options) {
  const id = await PeerId.create({ bits: 512 })
  const node = new Node({
    peerId: id,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    ...(options || {})
  })
  await node.start()

  return node
}

exports = module.exports = createLibp2pNode
exports.bundle = Node
