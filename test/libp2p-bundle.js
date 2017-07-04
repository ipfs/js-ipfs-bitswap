'use strict'

const TCP = require('libp2p-tcp')
const multiplex = require('libp2p-multiplex')
const secio = require('libp2p-secio')
const libp2p = require('libp2p')

class Node extends libp2p {
  constructor (peerInfo, peerBook, options) {
    options = options || {}

    const modules = {
      transport: [ new TCP() ],
      connection: {
        muxer: multiplex,
        crypto: [ secio ]
      },
      discovery: []
    }

    super(modules, peerInfo, peerBook, options)
  }
}

module.exports = Node
