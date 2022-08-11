
import { TCP } from '@libp2p/tcp'
import { Mplex } from '@libp2p/mplex'
import { Noise } from '@chainsafe/libp2p-noise'
import { createLibp2p } from 'libp2p'
import { KadDHT } from '@libp2p/kad-dht'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'

// @ts-ignore
import defaultsDeep from '@nodeutils/defaults-deep'

/**
 * @typedef {import('libp2p').Libp2p} Libp2p
 * @typedef {import('libp2p').Libp2pOptions & { DHT?: boolean}} NodeOptions
 */

/**
 * @param {NodeOptions} [options]
 *
 * @returns {Promise<Libp2p>}
 */
export async function createLibp2pNode (options) {
  options = options ?? {}

  const node = await createLibp2p(defaultsDeep({
    peerId: await createEd25519PeerId(),
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [
      new TCP()
    ],
    streamMuxers: [
      new Mplex()
    ],
    connectionEncryption: [
      new Noise()
    ],
    dht: options.DHT
      ? new KadDHT({
        clientMode: false
      })
      : undefined
  }, options))

  await node.start()

  return node
}
