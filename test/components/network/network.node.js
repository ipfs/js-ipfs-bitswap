/* eslint-env mocha */
'use strict'

const Node = require('../../libp2p-bundle')
const PeerInfo = require('peer-info')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerBook = require('peer-book')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const parallel = require('async/parallel')
const map = require('async/map')
const _ = require('lodash')
const utils = require('../../utils')

const Network = require('../../../src/components/network')
const Message = require('../../../src/types/message')

describe('network', () => {
  let libp2pNodeA
  let peerInfoA
  let peerBookA
  let networkA

  let libp2pNodeB
  let peerInfoB
  let peerBookB
  let networkB

  let libp2pNodeC
  let peerInfoC
  let peerBookC
  let networkC

  let blocks

  before((done) => {
    let counter = 0
    parallel([
      (cb) => PeerInfo.create(cb),
      (cb) => PeerInfo.create(cb),
      (cb) => PeerInfo.create(cb),
      (cb) => map(_.range(2), (i, cb) => utils.makeBlock(cb), cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }

      peerInfoA = results[0]
      peerInfoB = results[1]
      peerInfoC = results[2]

      blocks = results[3]

      const maA = '/ip4/127.0.0.1/tcp/10100/ipfs/' + peerInfoA.id.toB58String()
      const maB = '/ip4/127.0.0.1/tcp/10300/ipfs/' + peerInfoB.id.toB58String()
      const maC = '/ip4/127.0.0.1/tcp/10500/ipfs/' + peerInfoC.id.toB58String()

      peerInfoA.multiaddrs.add(maA)
      peerInfoB.multiaddrs.add(maB)
      peerInfoC.multiaddrs.add(maC)

      peerBookA = new PeerBook()
      peerBookB = new PeerBook()
      peerBookC = new PeerBook()

      peerBookA.put(peerInfoB)
      peerBookA.put(peerInfoC)

      peerBookB.put(peerInfoA)
      peerBookB.put(peerInfoC)

      peerBookC.put(peerInfoA)
      peerBookC.put(peerInfoB)

      libp2pNodeA = new Node(peerInfoA, peerBookA)
      libp2pNodeA.start(started)
      libp2pNodeB = new Node(peerInfoB, peerBookB)
      libp2pNodeB.start(started)
      libp2pNodeC = new Node(peerInfoC, peerBookC)
      libp2pNodeC.start(started)

      function started () {
        if (++counter === 3) {
          done()
        }
      }
    })
  })

  after((done) => {
    let counter = 0
    libp2pNodeA.stop(stopped)
    libp2pNodeB.stop(stopped)
    libp2pNodeC.stop(stopped)

    function stopped () {
      if (++counter === 3) {
        done()
      }
    }
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
    networkA = new Network(libp2pNodeA, peerBookA, bitswapMockA)
    networkB = new Network(libp2pNodeB, peerBookB, bitswapMockB)
    // only bitswap100
    networkC = new Network(libp2pNodeC, peerBookC, bitswapMockC, true)

    expect(networkA).to.exist()
    expect(networkB).to.exist()
    expect(networkC).to.exist()

    networkA.start()
    networkB.start()
    networkC.start()

    done()
  })

  it('connectTo fail', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.exist()
      done()
    })
  })

  it('onPeerConnected success', (done) => {
    var counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoB.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoA.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    libp2pNodeA.dial(peerInfoB, (err) => {
      expect(err).to.not.exist()
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockB._onPeerConnected = () => {}
      done()
    }
  })

  it('connectTo success', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.not.exist()
      done()
    })
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

    libp2pNodeA.dial(peerInfoB, '/ipfs/bitswap/1.0.0', (err, conn) => {
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

    libp2pNodeA.dial(peerInfoB, '/ipfs/bitswap/1.1.0', (err, conn) => {
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

    networkA.sendMessage(peerInfoB.id, msg, (err) => {
      expect(err).to.not.exist()
    })
  })

  it('dial to peer on Bitswap 1.0.0', (done) => {
    let counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoC.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    bitswapMockC._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoA.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    libp2pNodeA.dial(peerInfoC, (err) => {
      expect(err).to.not.exist()
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockC._onPeerConnected = () => {}
      networkA.connectTo(peerInfoC.id, done)
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

    networkA.sendMessage(peerInfoC.id, msg, (err) => {
      expect(err).to.not.exist()
    })
  })
})
