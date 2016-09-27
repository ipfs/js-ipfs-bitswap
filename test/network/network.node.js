/* eslint-env mocha */
'use strict'

const libp2p = require('libp2p-ipfs')
const PeerInfo = require('peer-info')
const multiaddr = require('multiaddr')
const expect = require('chai').expect
const PeerBook = require('peer-book')
const Block = require('ipfs-block')
const lp = require('pull-length-prefixed')
const pull = require('pull-stream')
const map = require('async/map')
const parallel = require('async/parallel')

const Network = require('../../src/network')
const Message = require('../../src/message')

describe('network', function () {
  this.timeout(15 * 1000)

  let libp2pNodeA
  let libp2pNodeB
  let peerInfoA
  let peerInfoB
  let peerBookA
  let peerBookB
  let networkA
  let networkB
  let blocks

  before((done) => {
    let counter = 0
    parallel([
      (cb) => PeerInfo.create(cb),
      (cb) => PeerInfo.create(cb),
      (cb) => map(['hello', 'world'], Block.create, cb)
    ], (err, results) => {
      if (err) {
        return done(err)
      }

      peerInfoA = results[0]
      peerInfoB = results[1]
      blocks = results[2]

      peerInfoA.multiaddr.add(multiaddr('/ip4/127.0.0.1/tcp/10100/ipfs/' + peerInfoA.id.toB58String()))
      peerInfoB.multiaddr.add(multiaddr('/ip4/127.0.0.1/tcp/10500/ipfs/' + peerInfoB.id.toB58String()))

      peerBookA = new PeerBook()
      peerBookB = new PeerBook()

      peerBookA.put(peerInfoB)
      peerBookB.put(peerInfoA)

      libp2pNodeA = new libp2p.Node(peerInfoA, peerBookA)
      libp2pNodeA.start(started)
      libp2pNodeB = new libp2p.Node(peerInfoB, peerBookB)
      libp2pNodeB.start(started)

      function started () {
        if (++counter === 2) {
          done()
        }
      }
    })
  })

  after((done) => {
    let counter = 0
    libp2pNodeA.stop(stopped)
    libp2pNodeB.stop(stopped)

    function stopped () {
      if (++counter === 2) {
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

  it('instantiate the network obj', (done) => {
    networkA = new Network(libp2pNodeA, peerBookA, bitswapMockA)
    networkB = new Network(libp2pNodeB, peerBookB, bitswapMockB)
    expect(networkA).to.exist
    expect(networkB).to.exist

    networkA.start()
    networkB.start()
    done()
  })

  it('connectTo fail', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.exist
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

    libp2pNodeA.dialByPeerInfo(peerInfoB, (err) => {
      expect(err).to.not.exist
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockB._onPeerConnected = () => {}
      done()
    }
  })

  it('connectTo success', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.not.exist
      done()
    })
  })

  it('_receiveMessage success', (done) => {
    const msg = new Message(true)
    const b = blocks[0]
    msg.addEntry(b.key, 0, false)
    msg.addBlock(b)
    msg.addBlock(blocks[1])

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.deep.equal(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      bitswapMockB._receiveError = () => {}
      done()
    }

    bitswapMockB._receiveError = (err) => {
      expect(err).to.not.exist
    }

    libp2pNodeA.dialByPeerInfo(peerInfoB, '/ipfs/bitswap/1.0.0', (err, conn) => {
      expect(err).to.not.exist

      pull(
        pull.values([msg.toProto()]),
        lp.encode(),
        conn
      )
    })
  })

  it('sendMessage', (done) => {
    const msg = new Message(true)
    msg.addEntry(blocks[0].key, 0, false)
    msg.addBlock(blocks[0])
    msg.addBlock(blocks[1])

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.deep.equal(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      done()
    }

    networkA.sendMessage(peerInfoB.id, msg, (err) => {
      expect(err).to.not.exist
    })
  })
})
