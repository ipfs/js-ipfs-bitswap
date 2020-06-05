/* eslint-env mocha */
'use strict'

const { expect, assert } = require('aegir/utils/chai')
const lp = require('it-length-prefixed')
const pipe = require('it-pipe')
const pDefer = require('p-defer')
const pWaitFor = require('p-wait-for')
const createLibp2pNode = require('../utils/create-libp2p-node')
const makeBlock = require('../utils/make-block')
const Network = require('../../src/network')
const Message = require('../../src/types/message')

describe('network', () => {
  let p2pA
  let networkA

  let p2pB
  let networkB

  let p2pC
  let networkC

  let blocks

  before(async () => {
    [p2pA, p2pB, p2pC] = await Promise.all([
      createLibp2pNode(),
      createLibp2pNode(),
      createLibp2pNode()
    ])
    blocks = await makeBlock(2)
  })

  after(() => {
    p2pA.stop()
    p2pB.stop()
    p2pC.stop()
  })

  const bitswapMockA = {
    _receiveMessage: async () => {},
    _receiveError: async () => {},
    _onPeerConnected: async () => {},
    _onPeerDisconnected: async () => {}
  }

  const bitswapMockB = {
    _receiveMessage: async () => {},
    _receiveError: async () => {},
    _onPeerConnected: async () => {},
    _onPeerDisconnected: async () => {}
  }

  const bitswapMockC = {
    _receiveMessage: async () => {},
    _receiveError: async () => {},
    _onPeerConnected: async () => {},
    _onPeerDisconnected: async () => {}
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
      await networkA.connectTo(p2pB.peerId)
      assert.fail()
    } catch (err) {
      expect(err).to.exist()
    }
  })

  it('onPeerConnected success', async () => {
    var counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pB.peerId.toB58String())
      counter++
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pA.peerId.toB58String())
      counter++
    }

    p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)
    await p2pA.dial(p2pB.peerId)

    await pWaitFor(() => counter >= 2)
    bitswapMockA._onPeerConnected = () => {}
    bitswapMockB._onPeerConnected = () => {}
  })

  it('connectTo success', async () => {
    p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)
    await networkA.connectTo(p2pB.peerId)
  })

  const versions = [{
    num: '1.0.0', serialize: (msg) => msg.serializeToBitswap100()
  }, {
    num: '1.1.0', serialize: (msg) => msg.serializeToBitswap110()
  }, {
    num: '1.2.0', serialize: (msg) => msg.serializeToBitswap110()
  }]
  for (const version of versions) {
    it('._receiveMessage success from Bitswap ' + version.num, async () => { // eslint-disable-line no-loop-func
      const msg = new Message(true)
      const b1 = blocks[0]
      const b2 = blocks[1]
      const deferred = pDefer()

      msg.addEntry(b1.cid, 0)
      msg.addBlock(b1)
      msg.addBlock(b2)

      bitswapMockB._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
        expect(msg).to.eql(msgReceived)
        bitswapMockB._receiveMessage = async () => {}
        bitswapMockB._receiveError = async () => {}
        deferred.resolve()
      }

      bitswapMockB._receiveError = (err) => deferred.reject(err)

      p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)
      const { stream } = await p2pA.dialProtocol(p2pB.peerId, '/ipfs/bitswap/' + version.num)
      await pipe(
        [version.serialize(msg)],
        lp.encode(),
        stream
      )

      await deferred.promise
    })
  }

  // From p2pA to p2pB
  it('.sendMessage on Bitswap 1.1.0', async () => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]
    const deferred = pDefer()

    msg.addEntry(b1.cid, 0)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockB._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
      expect(msg).to.eql(msgReceived)
      bitswapMockB._receiveMessage = async () => {}
      bitswapMockB._receiveError = async () => {}
      deferred.resolve()
    }

    bitswapMockB._receiveError = deferred.reject

    await networkA.sendMessage(p2pB.peerId, msg)
  })

  it('dial to peer on Bitswap 1.0.0', async () => {
    p2pA.peerStore.addressBook.set(p2pC.peerId, p2pC.multiaddrs)
    const { protocol } = await p2pA.dialProtocol(p2pC.peerId, ['/ipfs/bitswap/1.1.0', '/ipfs/bitswap/1.0.0'])

    expect(protocol).to.equal('/ipfs/bitswap/1.0.0')
  })

  // From p2pA to p2pC
  it('.sendMessage on Bitswap 1.1.0', async () => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]
    const deferred = pDefer()

    msg.addEntry(b1.cid, 0)
    msg.addBlock(b1)
    msg.addBlock(b2)

    bitswapMockC._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
      expect(msg).to.eql(msgReceived)
      bitswapMockC._receiveMessage = async () => {}
      bitswapMockC._receiveError = async () => {}
      deferred.resolve()
    }

    bitswapMockC._receiveError = deferred.reject

    await networkA.sendMessage(p2pC.peerId, msg)
    await deferred.promise
  })

  it('dials to peer using Bitswap 1.2.0', async () => {
    networkA = new Network(p2pA, bitswapMockA)

    // only supports 1.2.0
    networkB = new Network(p2pB, bitswapMockB)
    networkB.protocols = ['/ipfs/bitswap/1.2.0']

    networkA.start()
    networkB.start()

    p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)

    const deferred = pDefer()

    bitswapMockB._receiveMessage = () => {
      deferred.resolve()
    }

    await networkA.sendMessage(p2pB.peerId, new Message(true))

    return deferred
  })
})
