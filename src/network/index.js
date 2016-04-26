'use strict'

const bl = require('bl')
const fs = require('fs')
const path = require('path')
const protobuf = require('protocol-buffers')
const pbm = protobuf(fs.readFileSync(path.join(__dirname, '../message/message.proto')))

module.exports = class Network {
  constructor (libp2p, peerBook, bitswap) {
    this.libp2p = libp2p
    this.peerBook = peerBook

    this.libp2p.swarm.handle('/ipfs/bitswap/1.0.0', (conn) => {
      conn.pipe(bl((err, data) => {
        conn.end()
        if (err) {
          return bitswap._receiveError(err)
        }
        let msg
        try {
          msg = pbm.Message.decode(data)
        } catch (err) {
          return bitswap._receiveError(err)
        }
        bitswap._receiveMessage(conn.peerId, msg)
      }))
    })

    this.libp2p.swarm.on('peer-mux-established', (peerInfo) => {
      bitswap._onPeerConnected(peerInfo.id)
    })

    this.libp2p.swarm.on('peer-mux-closed', (peerInfo) => {
      bitswap._onPeerDisconnected(peerInfo.id)
    })
  }

  // Connect to the given peer
  connectTo (peerId, cb) {
    // NOTE: For now, all this does is ensure that we are
    // connected. Once we have Peer Routing, we will be able
    // to find the Peer
    if (this.libp2p.swarm.muxedConns[peerId.toB58String()]) {
      cb()
    } else {
      cb(new Error('Could not connect to peer with peerId:', peerId.toB58String()))
    }
  }

  // Send the given msg (instance of Message) to the given peer
  sendMessage (peerId, msg, cb) {
    try {
      const peerInfo = this.peerBook.getByMultihash(peerId.toBytes())
      const conn = this.libp2p.swarm.dial(peerInfo, '/ipfs/bitswap/1.0.0', (err) => {
        if (err) {
          return cb(err)
        }
        const msgEncoded = pbm.Message.encode(msg)
        conn.write(msgEncoded)
        conn.end()
        cb()
      })
    } catch (err) {
      cb(err)
    }
  }
}
