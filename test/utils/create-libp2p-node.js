
// @ts-ignore
import TCP from 'libp2p-tcp'
// @ts-ignore
import MPLEX from 'libp2p-mplex'
import { NOISE } from '@chainsafe/libp2p-noise'
import Libp2p from 'libp2p'
import KadDHT from 'libp2p-kad-dht'
import PeerId from 'peer-id'
// @ts-ignore
import defaultsDeep from '@nodeutils/defaults-deep'

/**
 * @typedef {Partial<import('libp2p').Libp2pOptions> & Partial<import('libp2p').constructorOptions> & { DHT?: boolean}} NodeOptions
 */

export class Node extends Libp2p {
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
export async function createLibp2pNode (options) {
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
