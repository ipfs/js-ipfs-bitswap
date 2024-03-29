import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { type KadDHT, kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { tcp } from '@libp2p/tcp'
// @ts-expect-error no types
import defaultsDeep from '@nodeutils/defaults-deep'
import { createLibp2p, type Libp2pOptions } from 'libp2p'
import type { Libp2p, ServiceMap } from '@libp2p/interface'

export interface NodeOptions extends Libp2pOptions {
  DHT?: boolean
}

export async function createLibp2pNode (options: NodeOptions = {}): Promise<Libp2p<{ dht: KadDHT }>> {
  const services: ServiceMap = {
    identify: identify()
  }

  if (options.DHT === true) {
    services.dht = kadDHT({
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper,
      clientMode: false
    })
  }

  const node = await createLibp2p<{ dht: KadDHT }>(defaultsDeep({
    peerId: await createEd25519PeerId(),
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [
      tcp()
    ],
    streamMuxers: [
      yamux()
    ],
    connectionEncryption: [
      noise()
    ],
    services
  }, options))

  await node.start()

  return node
}
