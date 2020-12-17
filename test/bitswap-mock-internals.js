/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 5] */
'use strict'

const range = require('lodash.range')
const { expect } = require('aegir/utils/chai')
const PeerId = require('peer-id')
const all = require('it-all')
const drain = require('it-drain')
const Message = require('../src/types/message')
const Bitswap = require('../src')
const CID = require('cids')
const Block = require('ipld-block')
const AbortController = require('native-abort-controller')
const delay = require('delay')

const createTempRepo = require('./utils/create-temp-repo-nodejs')
const mockNetwork = require('./utils/mocks').mockNetwork
const applyNetwork = require('./utils/mocks').applyNetwork
const mockLibp2pNode = require('./utils/mocks').mockLibp2pNode
const storeHasBlocks = require('./utils/store-has-blocks')
const makeBlock = require('./utils/make-block')
const { makePeerIds } = require('./utils/make-peer-id')
const orderedFinish = require('./utils/helpers').orderedFinish

function wantsBlock (cid, bitswap) {
  for (const [, value] of bitswap.getWantlist()) {
    if (value.cid.toString() === cid.toString()) {
      return true
    }
  }

  return false
}

describe('bitswap with mocks', function () {
  this.timeout(10 * 1000)

  let repo
  let blocks
  let ids

  before(async () => {
    repo = await createTempRepo()
    blocks = await makeBlock(15)
    ids = await makePeerIds(2)
  })

  after(() => repo.teardown())

  describe('receive message', () => {
    it('simple block message', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      bs.start()

      const other = ids[1]

      const b1 = blocks[0]
      const b2 = blocks[1]

      bs.wm.wantBlocks([b1.cid, b2.cid])

      const msg = new Message(false)
      msg.addBlock(b1)
      msg.addBlock(b2)

      await bs._receiveMessage(other, msg)

      const blks = await Promise.all([
        b1.cid, b2.cid
      ].map((cid) => repo.blocks.get(cid)))

      expect(blks[0].data).to.eql(b1.data)
      expect(blks[1].data).to.eql(b2.data)

      const ledger = bs.ledgerForPeer(other)
      expect(ledger.peer).to.equal(other.toPrint())
      expect(ledger.value).to.equal(0)
      expect(ledger.sent).to.equal(0)
      expect(ledger.recv).to.equal(96)
      expect(ledger.exchanged).to.equal(2)

      bs.stop()
    })

    it('simple want message', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      bs.start()

      const other = ids[1]
      const b1 = blocks[0]
      const b2 = blocks[1]

      const msg = new Message(false)

      msg.addEntry(b1.cid, 1)
      msg.addEntry(b2.cid, 1)

      await bs._receiveMessage(other, msg)

      const wl = bs.wantlistForPeer(other)

      expect(wl.has(b1.cid.toString('base58btc'))).to.eql(true)
      expect(wl.has(b2.cid.toString('base58btc'))).to.eql(true)

      bs.stop()
    })

    it('multi peer', async function () {
      this.timeout(80 * 1000)
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      bs.start()

      const others = await makePeerIds(5)
      const blocks = await makeBlock(10)

      const messages = await Promise.all(range(5).map((i) => {
        const msg = new Message(false)
        msg.addBlock(blocks[i])
        msg.addBlock(blocks[i + 5])
        return msg
      }))

      let i = 0
      for (const other of others) {
        const msg = messages[i]
        i++

        const cids = [...msg.blocks.values()].map(b => b.cid)
        bs.wm.wantBlocks(cids)

        await bs._receiveMessage(other, msg)
        await storeHasBlocks(msg, repo.blocks)
      }

      bs.stop()
    })

    it('ignore unwanted blocks', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      bs.start()

      const other = ids[1]

      const b1 = blocks[2]
      const b2 = blocks[3]
      const b3 = blocks[4]

      bs.wm.wantBlocks([b2.cid])

      const msg = new Message(false)
      msg.addBlock(b1)
      msg.addBlock(b2)
      msg.addBlock(b3)

      await bs._receiveMessage(other, msg)

      const res = await Promise.all([b1.cid, b2.cid, b3.cid].map((cid) => repo.blocks.get(cid).then(() => true, () => false)))
      expect(res).to.eql([false, true, false])

      const ledger = bs.ledgerForPeer(other)
      expect(ledger.peer).to.equal(other.toPrint())
      expect(ledger.value).to.equal(0)

      // Note: Keeping track of received bytes for blocks affects the
      // debt ratio, which in future may be used as part of fairness
      // algorithms when prioritizing who to send blocks to.
      // So we may want to revise whether we record received blocks from
      // a peer even if we didn't ask for the blocks.
      // For now keeping it liks this to match the go implementation:
      // https://github.com/ipfs/go-bitswap/blob/acc22c283722c15436120ae522c8e8021d0b06f8/bitswap.go#L293
      expect(ledger.sent).to.equal(0)
      expect(ledger.recv).to.equal(144)
      expect(ledger.exchanged).to.equal(3)

      bs.stop()
    })
  })

  describe('get', () => {
    it('fails on requesting empty block', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      try {
        // @ts-expect-error we want this to fail
        await bs.get(null)
      } catch (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('Not a valid cid')
      }
    })

    it('block exists locally', async () => {
      const block = blocks[4]
      await repo.blocks.put(block)
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const retrievedBlock = await bs.get(block.cid)
      expect(retrievedBlock).to.eql(block)
    })

    it('blocks exist locally', async () => {
      const b1 = blocks[3]
      const b2 = blocks[14]
      const b3 = blocks[13]

      await drain(repo.blocks.putMany([b1, b2, b3]))
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const retrievedBlocks = await all(bs.getMany([b1.cid, b2.cid, b3.cid]))

      expect(retrievedBlocks).to.be.eql([b1, b2, b3])
    })

    it('getMany', async () => {
      const b1 = blocks[5]
      const b2 = blocks[6]
      const b3 = blocks[7]

      await drain(repo.blocks.putMany([b1, b2, b3]))
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const block1 = await bs.get(b1.cid)
      expect(block1).to.eql(b1)

      const block2 = await bs.get(b2.cid)
      expect(block2).to.eql(b2)

      const block3 = await bs.get(b3.cid)
      expect(block3).to.eql(b3)
    })

    it('block is added locally afterwards', async () => {
      const finish = orderedFinish(2)
      const block = blocks[9]
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      const net = mockNetwork()

      bs.network = net
      bs.wm.network = net
      bs.engine.network = net
      bs.start()
      const get = bs.get(block.cid)

      setTimeout(() => {
        finish(1)
        bs.put(block)
      }, 200)

      const res = await get
      expect(res).to.eql(block)
      finish(2)

      finish.assert()
      bs.stop()
    })

    it('block is sent after local add', async () => {
      const me = ids[0]
      const other = ids[1]
      const block = blocks[10]

      const n1 = {
        connectTo (id) {
          if (id.toHexString() !== other.toHexString()) {
            throw new Error('unknown peer')
          }

          return Promise.resolve()
        },
        sendMessage (id, msg) {
          if (id.toHexString() === other.toHexString()) {
            return bs2._receiveMessage(me, msg)
          }
          throw new Error('unkown peer')
        },
        start () {
          return Promise.resolve()
        },
        stop () {
          return Promise.resolve()
        },
        findAndConnect (cid) {
          return Promise.resolve()
        },
        provide (cid) {
          return Promise.resolve()
        }
      }
      const n2 = {
        connectTo (id) {
          if (id.toHexString() !== me.toHexString()) {
            throw new Error('unknown peer')
          }

          return Promise.resolve()
        },
        sendMessage (id, msg) {
          if (id.toHexString() === me.toHexString()) {
            return bs1._receiveMessage(other, msg)
          }
          throw new Error('unkown peer')
        },
        start () {
          return Promise.resolve()
        },
        stop () {
          return Promise.resolve()
        },
        findAndConnect (cid) {
          return Promise.resolve()
        },
        provide (cid) {
          return Promise.resolve()
        }
      }

      // Create and start bs1
      const bs1 = new Bitswap(mockLibp2pNode(), repo.blocks)
      applyNetwork(bs1, n1)
      bs1.start()

      // Create and start bs2
      const repo2 = await createTempRepo()
      const bs2 = new Bitswap(mockLibp2pNode(), repo2.blocks)
      applyNetwork(bs2, n2)
      bs2.start()

      bs1._onPeerConnected(other)
      bs2._onPeerConnected(me)

      const p1 = bs1.get(block.cid)
      setTimeout(() => {
        bs2.put(block)
      }, 1000)
      const b1 = await p1
      expect(b1).to.eql(block)

      bs1.stop()
      bs2.stop()
    })

    it('double get', async () => {
      const block = blocks[11]

      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      const resP = Promise.all([
        bs.get(block.cid),
        bs.get(block.cid)
      ])

      bs.put(block)

      const res = await resP
      expect(res[0]).to.eql(block)
      expect(res[1]).to.eql(block)
    })

    it('gets the same block data with different CIDs', async () => {
      const block = blocks[11]

      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)

      expect(block).to.have.nested.property('cid.codec', 'dag-pb')
      expect(block).to.have.nested.property('cid.version', 0)

      const cid1 = new CID(0, 'dag-pb', block.cid.multihash)
      const cid2 = new CID(1, 'dag-pb', block.cid.multihash)
      const cid3 = new CID(1, 'raw', block.cid.multihash)

      const resP = Promise.all([
        bs.get(cid1),
        bs.get(cid2),
        bs.get(cid3)
      ])

      bs.put(block)

      const res = await resP

      // blocks should have the requested CID but with the same data
      expect(res[0]).to.deep.equal(new Block(block.data, cid1))
      expect(res[1]).to.deep.equal(new Block(block.data, cid2))
      expect(res[2]).to.deep.equal(new Block(block.data, cid3))
    })

    it('removes a block from the wantlist when the request is aborted', async () => {
      const block = await makeBlock()
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      const controller = new AbortController()

      const p = bs.get(block.cid, {
        signal: controller.signal
      })

      await delay(1000)

      expect(wantsBlock(block.cid, bs)).to.be.true()

      controller.abort()

      await expect(p).to.eventually.rejectedWith(/aborted/)

      expect(wantsBlock(block.cid, bs)).to.be.false()
    })

    it('block should still be in the wantlist if only one request is aborted', async () => {
      const block = await makeBlock()
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      const controller = new AbortController()

      // request twice
      const p1 = bs.get(block.cid, {
        signal: controller.signal
      })
      const p2 = bs.get(block.cid)

      await delay(100)

      // should want the block
      expect(wantsBlock(block.cid, bs)).to.be.true()

      // abort one request
      controller.abort()

      await expect(p1).to.eventually.rejectedWith(/aborted/)

      // here comes the block
      bs.put(block)

      // should still want it
      expect(wantsBlock(block.cid, bs)).to.be.true()

      // second request should resolve with the block
      await expect(p2).to.eventually.deep.equal(block)

      // should not be in the want list any more
      expect(wantsBlock(block.cid, bs)).to.be.false()
    })
  })

  describe('unwant', () => {
    it('removes blocks that are wanted multiple times', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      bs.start()

      const b = blocks[12]
      const p = Promise.all([
        bs.get(b.cid),
        bs.get(b.cid)
      ])

      setTimeout(() => bs.unwant(b.cid), 1e3)

      await expect(p).to.eventually.be.rejected()

      bs.stop()
    })
  })

  describe('ledgerForPeer', () => {
    it('returns null for unknown peer', async () => {
      const bs = new Bitswap(mockLibp2pNode(), repo.blocks)
      const id = await PeerId.create({ bits: 512 })
      const ledger = bs.ledgerForPeer(id)
      expect(ledger).to.equal(null)
    })
  })
})
