/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')

const Node = require('../utils/create-libp2p-node').bundle
const makeBlock = require('../utils/make-block')
const Network = require('../../src/network')
const Message = require('../../src/types/message')

// TODO send this to utils
async function createP2PNode (multiaddrs, options) {
  if (!Array.isArray(multiaddrs)) {
    multiaddrs = [multiaddrs]
  }

  const peerId = await PeerId.create({ bits: 512 })
  const peerInfo = await PeerInfo.create(peerId)
  multiaddrs.map((ma) => peerInfo.multiaddrs.add(ma))
  options.peerInfo = peerInfo
  const node = new Node(options)
  return node
}

describe('network', () => {
  let p2pA
  let networkA

  let p2pB
  let networkB

  let p2pC
  let networkC

  let blocks

  before(async () => {
    const [p2pA, p2pB, p2pC] = await Promise.all([
      createP2PNode('/ip4/127.0.0.1/tcp/0'),
      createP2PNode('/ip4/127.0.0.1/tcp/0'),
      createP2PNode('/ip4/127.0.0.1/tcp/0')
    ])
    blocks = await makeBlock(2)

    p2pA.start()
    p2pB.start()
    p2pC.start()
  })

  after(() => {
    p2pA.stop()
    p2pB.stop()
    p2pC.stop()
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

  it('instantiate the network obj', () => {
    networkA = new Network(p2pA, bitswapMockA)
    networkB = new Network(p2pB, bitswapMockB)
    // only bitswap100
    networkC = new Network(p2pC, bitswapMockC, { b100Only: true })

    expect(networkA).to.exist()
    expect(networkB).to.exist()
    expect(networkC).to.exist()

    networkA.start()
    networkB.start()
    networkC.start()
  })

  it('connectTo fail', async () => {
    try {
      await networkA.connectTo(p2pB.peerInfo.id)
      chai.assert.fail()
    } catch (err) {
      expect(err).to.exist()
    }
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

  it('connectTo success', async () => {
    await networkA.connectTo(p2pB.peerInfo)
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

    p2pA.dialProtocol(p2pB.peerInfo, '/ipfs/bitswap/1.0.0', (err, conn) => {
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

    p2pA.dialProtocol(p2pB.peerInfo, '/ipfs/bitswap/1.1.0', (err, conn) => {
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
      networkA.connectTo(p2pC.peerInfo.id).then(() => {
        done()
      })
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
