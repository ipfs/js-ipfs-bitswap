/* eslint-env mocha */
'use strict'

const { expect, assert } = require('aegir/utils/chai')
const lp = require('it-length-prefixed')
const { pipe } = require('it-pipe')
const pDefer = require('p-defer')
const createLibp2pNode = require('../utils/create-libp2p-node')
const makeBlock = require('../utils/make-blocks')
const Network = require('../../src/network')
const Message = require('../../src/types/message')
const Stats = require('../../src/stats')
const sinon = require('sinon')
const { CID } = require('multiformats')
const { Multiaddr } = require('multiaddr')

/**
 * @typedef {import('libp2p')} Libp2p
 * @typedef {import('../../src/bitswap')} Bitswap
 */

/**
 * @returns {import('../../src/bitswap')}
 */
function createBitswapMock () {
  // @ts-ignore
  return {
    _receiveMessage: async () => {},
    _receiveError: async () => {},
    _onPeerConnected: async () => {},
    _onPeerDisconnected: async () => {}
  }
}

describe('network', () => {
  /** @type {Libp2p} */
  let p2pA
  /** @type {Network} */
  let networkA
  /** @type {Bitswap} */
  let bitswapMockA

  /** @type {Libp2p} */
  let p2pB
  /** @type {Network} */
  let networkB
  /** @type {Bitswap} */
  let bitswapMockB

  /** @type {Libp2p} */
  let p2pC
  /** @type {Network} */
  let networkC
  /** @type {Bitswap} */
  let bitswapMockC

  /** @type {{ cid: CID, data: Uint8Array}[]} */
  let blocks

  beforeEach(async () => {
    [p2pA, p2pB, p2pC] = await Promise.all([
      createLibp2pNode(),
      createLibp2pNode(),
      createLibp2pNode()
    ])
    blocks = await makeBlock(2)

    bitswapMockA = createBitswapMock()
    bitswapMockB = createBitswapMock()
    bitswapMockC = createBitswapMock()

    networkA = new Network(p2pA, bitswapMockA, new Stats())
    networkB = new Network(p2pB, bitswapMockB, new Stats())
    // only bitswap100
    networkC = new Network(p2pC, bitswapMockC, new Stats(), { b100Only: true })

    networkA.start()
    networkB.start()
    networkC.start()
  })

  afterEach(() => {
    p2pA.stop()
    p2pB.stop()
    p2pC.stop()
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
    const p2pAConnected = pDefer()
    const p2pBConnected = pDefer()

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pB.peerId.toB58String())
      p2pBConnected.resolve()
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pA.peerId.toB58String())
      p2pAConnected.resolve()
    }

    const ma = `${p2pB.multiaddrs[0]}/p2p/${p2pB.peerId.toB58String()}`
    await p2pA.dial(ma)

    await Promise.all([
      p2pAConnected,
      p2pBConnected
    ])
  })

  it('connectTo success', async () => {
    const ma = new Multiaddr(`${p2pB.multiaddrs[0]}/p2p/${p2pB.peerId.toB58String()}`)
    await networkA.connectTo(ma)
  })

  it('sets up peer handlers for previously connected peers', async () => {
    let p2pAConnected = pDefer()
    let p2pBConnected = pDefer()

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pB.peerId.toB58String())
      p2pBConnected.resolve()
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(p2pA.peerId.toB58String())
      p2pAConnected.resolve()
    }

    const ma = `${p2pB.multiaddrs[0]}/p2p/${p2pB.peerId.toB58String()}`
    await p2pA.dial(ma)

    await Promise.all([
      p2pAConnected,
      p2pBConnected
    ])

    networkA.stop()
    networkB.stop()

    p2pAConnected = pDefer()
    p2pBConnected = pDefer()

    networkA.start()
    networkB.start()

    await Promise.all([
      p2pAConnected,
      p2pBConnected
    ])
  })

  const versions = [{
    num: '1.0.0', serialize: (/** @type {Message} */ msg) => msg.serializeToBitswap100()
  }, {
    num: '1.1.0', serialize: (/** @type {Message} */ msg) => msg.serializeToBitswap110()
  }, {
    num: '1.2.0', serialize: (/** @type {Message} */ msg) => msg.serializeToBitswap110()
  }]
  for (const version of versions) {
    it('._receiveMessage success from Bitswap ' + version.num, async () => { // eslint-disable-line no-loop-func
      const msg = new Message(true)
      const b1 = blocks[0]
      const b2 = blocks[1]
      const deferred = pDefer()

      msg.addEntry(b1.cid, 0)
      msg.addBlock(b1.cid, b1.data)
      msg.addBlock(b2.cid, b2.data)

      bitswapMockB._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
        // cannot do deep comparison on objects as one has Buffers and one has Uint8Arrays
        expect(msg.serializeToBitswap110()).to.equalBytes(msgReceived.serializeToBitswap110())

        bitswapMockB._receiveMessage = async () => {}
        bitswapMockB._receiveError = async () => {}
        deferred.resolve()
      }

      bitswapMockB._receiveError = (err) => deferred.reject(err)

      const ma = `${p2pB.multiaddrs[0]}/p2p/${p2pB.peerId.toB58String()}`
      const { stream } = await p2pA.dialProtocol(ma, '/ipfs/bitswap/' + version.num)

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
    msg.addBlock(b1.cid, b1.data)
    msg.addBlock(b2.cid, b2.data)

    // In a real network scenario, peers will be discovered and their addresses
    // will be added to the addressBook before bitswap kicks in
    p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)

    bitswapMockB._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
      // cannot do deep comparison on objects as one has Buffers and one has Uint8Arrays
      expect(msg.serializeToBitswap110()).to.equalBytes(msgReceived.serializeToBitswap110())

      bitswapMockB._receiveMessage = async () => {}
      bitswapMockB._receiveError = async () => {}
      deferred.resolve()
    }

    bitswapMockB._receiveError = deferred.reject

    await networkA.sendMessage(p2pB.peerId, msg)
  })

  it('dial to peer on Bitswap 1.0.0', async () => {
    const ma = `${p2pC.multiaddrs[0]}/p2p/${p2pC.peerId.toB58String()}`
    const { protocol } = await p2pA.dialProtocol(ma, ['/ipfs/bitswap/1.1.0', '/ipfs/bitswap/1.0.0'])

    expect(protocol).to.equal('/ipfs/bitswap/1.0.0')
  })

  // From p2pA to p2pC
  it('.sendMessage on Bitswap 1.1.0', async () => {
    const msg = new Message(true)
    const b1 = blocks[0]
    const b2 = blocks[1]
    const deferred = pDefer()

    msg.addEntry(b1.cid, 0)
    msg.addBlock(b1.cid, b1.data)
    msg.addBlock(b2.cid, b2.data)

    // In a real network scenario, peers will be discovered and their addresses
    // will be added to the addressBook before bitswap kicks in
    p2pA.peerStore.addressBook.set(p2pC.peerId, p2pC.multiaddrs)

    bitswapMockC._receiveMessage = async (peerId, msgReceived) => { // eslint-disable-line require-await
      // cannot do deep comparison on objects as one has Buffers and one has Uint8Arrays
      expect(msg.serializeToBitswap110()).to.equalBytes(msgReceived.serializeToBitswap110())

      bitswapMockC._receiveMessage = async () => {}
      bitswapMockC._receiveError = async () => {}
      deferred.resolve()
    }

    bitswapMockC._receiveError = deferred.reject

    await networkA.sendMessage(p2pC.peerId, msg)
    await deferred.promise
  })

  it('dials to peer using Bitswap 1.2.0', async () => {
    networkA = new Network(p2pA, bitswapMockA, new Stats())

    // only supports 1.2.0
    networkB = new Network(p2pB, bitswapMockB, new Stats())
    networkB._protocols = ['/ipfs/bitswap/1.2.0']

    networkA.start()
    networkB.start()

    // In a real network scenario, peers will be discovered and their addresses
    // will be added to the addressBook before bitswap kicks in
    p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.multiaddrs)

    const deferred = pDefer()

    bitswapMockB._receiveMessage = async () => {
      deferred.resolve()
    }

    await networkA.sendMessage(p2pB.peerId, new Message(true))

    return deferred
  })

  it('survives connection failures', async () => {
    const mockFindProviders = sinon.stub()
    const mockDial = sinon.stub()

    /** @type {Libp2p} */
    const libp2p = {
      // @ts-ignore incomplete implementation
      contentRouting: {
        findProviders: mockFindProviders
      },
      // @ts-ignore incomplete implementation
      registrar: {
        register: sinon.stub()
      },
      // @ts-ignore incomplete implementation
      peerStore: {
        peers: new Map()
      },
      dial: mockDial,
      handle: sinon.stub()
    }

    const network = new Network(libp2p, bitswapMockA, new Stats())

    const cid = CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
    const provider1 = {
      id: 'provider1'
    }
    const provider2 = {
      id: 'provider2'
    }

    mockFindProviders.withArgs(cid).returns([
      provider1,
      provider2
    ])

    mockDial.withArgs(provider1.id).returns(Promise.reject(new Error('Could not dial')))
    mockDial.withArgs(provider2.id).returns(Promise.resolve())

    network.start()

    await network.findAndConnect(cid)

    expect(mockDial.calledWith(provider1.id)).to.be.true()
    expect(mockDial.calledWith(provider2.id)).to.be.true()
  })
})
