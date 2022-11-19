
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { createLibp2p } from 'libp2p'
import { kadDHT } from '@libp2p/kad-dht'
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
      tcp()
    ],
    streamMuxers: [
      mplex()
    ],
    connectionEncryption: [
      noise()
    ],
    dht: options.DHT
      ? kadDHT({
        clientMode: false
      })
      : undefined
  }, options))

  await node.start()

  return node
}
