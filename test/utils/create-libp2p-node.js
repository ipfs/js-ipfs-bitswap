'use strict'

const TCP = require('libp2p-tcp')
const MPLEX = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const libp2p = require('libp2p')
const KadDHT = require('libp2p-kad-dht')
const PeerId = require('peer-id')

const defaultsDeep = require('@nodeutils/defaults-deep')

class Node extends libp2p {
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
          SECIO
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

async function createLibp2pNode (options = {}) {
  const id = await PeerId.create({ bits: 512 })
  const node = new Node({
    peerId: id,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    ...options
  })
  await node.start()

  return node
}

exports = module.exports = createLibp2pNode
exports.bundle = Node
