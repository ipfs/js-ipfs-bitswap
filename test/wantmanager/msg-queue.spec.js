/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const PeerId = require('peer-id')
const CID = require('cids')
const multihashing = require('multihashing-async')
const Message = require('../../src/types/message')
const MsgQueue = require('../../src/want-manager/msg-queue')
const defer = require('p-defer')
const {
  mockNetwork
} = require('../utils/mocks')

describe('MessageQueue', () => {
  /** @type {PeerId[]} */
  let peerIds
  /** @type {CID[]} */
  let cids

  before(async () => {
    peerIds = await Promise.all([0, 1].map(() => PeerId.create({ bits: 512 })))

    const data = ['1', '2', '3', '4', '5', '6'].map((d) => Buffer.from(d))
    const hashes = await Promise.all(data.map((d) => multihashing(d, 'sha2-256')))
    cids = hashes.map((h) => new CID(h))
  })

  it('connects and sends messages', async () => {
    const msg = new Message(true)
    const cid1 = cids[0]
    const cid2 = cids[1]
    const cid3 = cids[2]
    const cid4 = cids[3]
    const cid5 = cids[4]
    const cid6 = cids[5]

    msg.addEntry(cid1, 3)
    msg.addEntry(cid2, 1)

    const deferred = defer()

    const network = mockNetwork(2, ({ connects, messages }) => {
      expect(connects).to.be.eql([peerIds[1], peerIds[1]])

      const m1 = new Message(false)
      m1.addEntry(cid3, 1)
      m1.addEntry(cid4, 2)
      m1.cancel(cid5)
      m1.cancel(cid6)

      expect(
        messages
      ).to.be.eql([
        [peerIds[1], msg],
        [peerIds[1], m1]
      ])

      deferred.resolve()
    })

    const mq = new MsgQueue(peerIds[0], peerIds[1], network)

    expect(mq.refcnt).to.equal(1)

    const batch1 = [
      new Message.Entry(cid3, 1, Message.WantType.Block, false),
      new Message.Entry(cid4, 2, Message.WantType.Block, false)
    ]

    const batch2 = [
      new Message.Entry(cid5, 1, Message.WantType.Block, true),
      new Message.Entry(cid6, 2, Message.WantType.Block, true)
    ]

    mq.addEntries(batch1)
    mq.addEntries(batch2)
    mq.addMessage(msg)

    await deferred.promise
  })
})
