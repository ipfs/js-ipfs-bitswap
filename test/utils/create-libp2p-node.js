'use strict'

const TCP = require('libp2p-tcp')
const MPLEX = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const libp2p = require('libp2p')
const KadDHT = require('libp2p-kad-dht')
const waterfall = require('async/waterfall')
const PeerInfo = require('peer-info')
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
        dht: _options.DHT ? KadDHT : undefined
      },
      config: {
        dht: {},
        EXPERIMENTAL: {
          dht: Boolean(_options.DHT)
        }
      }
    }

    delete _options.DHT
    super(defaultsDeep(_options, defaults))
  }
}

function createLibp2pNode (options, callback) {
  let node

  waterfall([
    (cb) => PeerId.create({ bits: 512 }, cb),
    (id, cb) => PeerInfo.create(id, cb),
    (peerInfo, cb) => {
      peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0')
      options.peerInfo = peerInfo
      node = new Node(options)
      node.start(cb)
    }
  ], (err) => callback(err, node))
}

exports = module.exports = createLibp2pNode
exports.bundle = Node
