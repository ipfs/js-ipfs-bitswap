/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const parallel = require('async/parallel')
const waterfall = require('async/waterfall')
const map = require('async/map')
const _ = require('lodash')

const Node = require('../utils/create-libp2p-node').bundle
const makeBlock = require('../utils/make-block')
const Network = require('../../src/network')
const Message = require('../../src/types/message')

// TODO send this to utils
function createP2PNode (multiaddrs, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  if (!Array.isArray(multiaddrs)) {
    multiaddrs = [multiaddrs]
  }

  waterfall([
    (cb) => PeerId.create({ bits: 1024 }, cb),
    (peerId, cb) => PeerInfo.create(peerId, cb),
    (peerInfo, cb) => {
      multiaddrs.map((ma) => peerInfo.multiaddrs.add(ma))
      cb(null, peerInfo)
    },
    (peerInfo, cb) => {
      const node = new Node(peerInfo, undefined, options)
      cb(null, node)
    }
  ], callback)
}

describe('network', () => {
  let p2pA
  let networkA

  let p2pB
  let networkB

  let p2pC
  let networkC

  let blocks

  before((done) => {
    parallel([
      (cb) => createP2PNode('/ip4/127.0.0.1/tcp/0', { bits: 1024 }, cb),
      (cb) => createP2PNode('/ip4/127.0.0.1/tcp/0', { bits: 1024 }, cb),
      (cb) => createP2PNode('/ip4/127.0.0.1/tcp/0', { bits: 1024 }, cb),
      (cb) => map(_.range(2), (i, cb) => makeBlock(cb), cb)
    ], (err, results) => {
      expect(err).to.not.exist()

      p2pA = results[0]
      p2pB = results[1]
      p2pC = results[2]

      blocks = results[3]

      parallel([
        (cb) => p2pA.start(cb),
        (cb) => p2pB.start(cb),
        (cb) => p2pC.start(cb)
      ], done)
    })
  })

  after((done) => {
    parallel([
      (cb) => p2pA.stop(cb),
      (cb) => p2pB.stop(cb),
      (cb) => p2pC.stop(cb)
    ], done)
  })

  let bitswapMockA = {
    _receiveMessage: () => {},
    _receiveError: () => {},
    _onPeerConnected: () => {},
    _onPeerDisconnected: () => {}
  }

  let bitswapMockB = {
    _receiveMessage: () => {},
    _receiveError: () => {},
    _onPeerConnected: () => {},
    _onPeerDisconnected: () => {}
  }

  let bitswapMockC = {
    _receiveMessage: () => {},
    _receiveError: () => {},
    _onPeerConnected: () => {},
    _onPeerDisconnected: () => {}
  }

  it('instantiate the network obj', (done) => {
    networkA = new Network(p2pA, bitswapMockA)
    networkB = new Network(p2pB, bitswapMockB)
    // only bitswap100
    networkC = new Network(p2pC, bitswapMockC, { b100Only: true })

    expect(networkA).to.exist()
    expect(networkB).to.exist()
    expect(networkC).to.exist()

    parallel([
      (cb) => networkA.start(cb),
      (cb) => networkB.start(cb),
      (cb) => networkC.start(cb)
    ], done)
  })

  it('connectTo fail', (done) => {
    networkA.connectTo(p2pB.peerInfo.id, (err) => {
      expect(err).to.exist()
      done()
    })
  })

  it('onPeerConnected success', (done) => {
    var counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pB.peerInfo.id.toB58String())

      if (++counter === 2) {
        finish()
      }
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pA.peerInfo.id.toB58String())

      if (++counter === 2) {
        finish()
      }
    }

    p2pA.dial(p2pB.peerInfo, (err) => {
      expect(err).to.not.exist()
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockB._onPeerConnected = () => {}
      done()
    }
  })

  it('connectTo success', (done) => {
    networkA.connectTo(p2pB.peerInfo, done)
  })

  it('._receiveMessage success from Bitswap 1.0.0', (done) => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]

    msg.addEntry(b1.cid, 0, false)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.eql(msgReceived)

      bitswapMockB._receiveMessage = () => {}
      bitswapMockB._receiveError = () => {}
      done()
    }

    bitswapMockB._receiveError = (err) => {
      expect(err).to.not.exist()
    }

    p2pA.dial(p2pB.peerInfo, '/ipfs/bitswap/1.0.0', (err, conn) => {
      expect(err).to.not.exist()

      pull(
        pull.values([
          msg.serializeToBitswap100()
        ]),
        lp.encode(),
        conn
      )
    })
  })

  it('._receiveMessage success from Bitswap 1.1.0', (done) => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]

    msg.addEntry(b1.cid, 0, false)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.eql(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      bitswapMockB._receiveError = () => {}
      done()
    }

    bitswapMockB._receiveError = (err) => {
      expect(err).to.not.exist()
    }

    p2pA.dial(p2pB.peerInfo, '/ipfs/bitswap/1.1.0', (err, conn) => {
      expect(err).to.not.exist()

      pull(
        pull.values([
          msg.serializeToBitswap110()
        ]),
        lp.encode(),
        conn
      )
    })
  })

  it('.sendMessage on Bitswap 1.1.0', (done) => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]

    msg.addEntry(b1.cid, 0, false)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.eql(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      bitswapMockB._receiveError = () => {}
      done()
    }

    bitswapMockB._receiveError = (err) => {
      expect(err).to.not.exist()
    }

    networkA.sendMessage(p2pB.peerInfo.id, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  it('dial to peer on Bitswap 1.0.0', (done) => {
    let counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pC.peerInfo.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    bitswapMockC._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pA.peerInfo.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    p2pA.dial(p2pC.peerInfo, (err) => {
      expect(err).to.not.exist()
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockC._onPeerConnected = () => {}
      networkA.connectTo(p2pC.peerInfo.id, done)
    }
  })

  it('.sendMessage on Bitswap 1.1.0', (done) => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]

    msg.addEntry(b1.cid, 0, false)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockC._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.eql(msgReceived)
      bitswapMockC._receiveMessage = () => {}
      bitswapMockC._receiveError = () => {}
      done()
    }

    bitswapMockC._receiveError = (err) => {
      expect(err).to.not.exist()
    }

    networkA.sendMessage(p2pC.peerInfo.id, msg, (err) => {
      expect(err).to.not.exist()
    })
  })
})
