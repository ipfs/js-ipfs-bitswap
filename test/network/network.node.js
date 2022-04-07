/* eslint-env mocha */

import { expect, assert } from 'aegir/chai'
import * as lp from 'it-length-prefixed'
import { pipe } from 'it-pipe'
import pDefer from 'p-defer'
import { createLibp2pNode } from '../utils/create-libp2p-node.js'
import { makeBlocks } from '../utils/make-blocks.js'
import { Network } from '../../src/network.js'
import { BitswapMessage as Message } from '../../src/message/index.js'
import { Stats } from '../../src/stats/index.js'
import sinon from 'sinon'
import { CID } from 'multiformats/cid'

/**
 * @typedef {import('libp2p').Libp2p} Libp2p
 * @typedef {import('../../src/bitswap').Bitswap} Bitswap
 */

/**
 * @returns {import('../../src/bitswap').Bitswap}
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
    blocks = await makeBlocks(2)

    bitswapMockA = createBitswapMock()
    bitswapMockB = createBitswapMock()
    bitswapMockC = createBitswapMock()

    // @ts-expect-error {} is not a real libp2p
    networkA = new Network(p2pA, bitswapMockA, new Stats({}))
    // @ts-expect-error {} is not a real libp2p
    networkB = new Network(p2pB, bitswapMockB, new Stats({}))
    // only bitswap100
    // @ts-expect-error {} is not a real libp2p
    networkC = new Network(p2pC, bitswapMockC, new Stats({}), { b100Only: true })

    await networkA.start()
    await networkB.start()
    await networkC.start()
  })

  afterEach(async () => {
    await p2pA.stop()
    await p2pB.stop()
    await p2pC.stop()
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
      expect(peerId.toString()).to.equal(p2pB.peerId.toString())
      p2pBConnected.resolve()
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toString()).to.equal(p2pA.peerId.toString())
      p2pAConnected.resolve()
    }

    const ma = p2pB.getMultiaddrs()[0]
    await p2pA.dial(ma)

    await Promise.all([
      p2pAConnected,
      p2pBConnected
    ])
  })

  it('connectTo success', async () => {
    const ma = p2pB.getMultiaddrs()[0]
    await networkA.connectTo(ma)
  })

  it('sets up peer handlers for previously connected peers', async () => {
    let p2pAConnected = pDefer()
    let p2pBConnected = pDefer()

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toString()).to.equal(p2pB.peerId.toString())
      p2pBConnected.resolve()
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toString()).to.equal(p2pA.peerId.toString())
      p2pAConnected.resolve()
    }

    const ma = p2pB.getMultiaddrs()[0]
    await p2pA.dial(ma)

    await Promise.all([
      p2pAConnected,
      p2pBConnected
    ])

    await networkA.stop()
    await networkB.stop()

    p2pAConnected = pDefer()
    p2pBConnected = pDefer()

    await networkA.start()
    await networkB.start()

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

      const ma = p2pB.getMultiaddrs()[0]
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
    await p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.getMultiaddrs())

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
    const ma = p2pC.getMultiaddrs()[0]
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
    await p2pA.peerStore.addressBook.set(p2pC.peerId, p2pC.getMultiaddrs())

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
    await networkA.stop()
    await networkB.stop()

    // only supports 1.2.0
    networkB._protocols = ['/ipfs/bitswap/1.2.0']

    await networkA.start()
    await networkB.start()

    // In a real network scenario, peers will be discovered and their addresses
    // will be added to the addressBook before bitswap kicks in
    await p2pA.peerStore.addressBook.set(p2pB.peerId, p2pB.getMultiaddrs())

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
      // @ts-expect-error incomplete implementation
      contentRouting: {
        findProviders: mockFindProviders
      },
      // @ts-expect-error incomplete implementation
      registrar: {
        register: sinon.stub()
      },
      // @ts-expect-error incomplete implementation
      peerStore: {
        forEach: async () => {}
      },
      dial: mockDial,
      handle: sinon.stub()
    }

    const network = new Network(libp2p, bitswapMockA, new Stats(libp2p))

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

    await network.start()

    await network.findAndConnect(cid)

    expect(mockDial.calledWith(provider1.id)).to.be.true()
    expect(mockDial.calledWith(provider2.id)).to.be.true()
  })
})
