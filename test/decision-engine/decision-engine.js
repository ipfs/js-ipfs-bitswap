/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const range = require('lodash.range')
const difference = require('lodash.difference')
const flatten = require('lodash.flatten')
const Block = require('ipfs-block')
const CID = require('cids')
const multihashing = require('multihashing-async')
const Buffer = require('safe-buffer').Buffer
const promisify = require('promisify-es6')

const Message = require('../../src/types/message')
const DecisionEngine = require('../../src/decision-engine')
const createTempRepo = require('../utils/create-temp-repo-nodejs.js')

const mockNetwork = require('../utils/mocks').mockNetwork

function messageToString (m) {
  return Array.from(m[1].blocks.values())
    .map((b) => b.data.toString())
}

function stringifyMessages (messages) {
  return flatten(messages.map(messageToString))
}

async function newEngine (network) {
  const results = await Promise.all([
    createTempRepo(),
    promisify(PeerId.create)({ bits: 512 })
  ])
  const blockstore = results[0].blocks
  const peerId = results[1]
  const engine = new DecisionEngine(peerId, blockstore, network || mockNetwork())
  engine.start()
  return { peer: peerId, engine: engine }
}

describe('Engine', () => {
  it('consistent accounting', async () => {
    const res = await Promise.all([
      newEngine(false),
      newEngine(false)
    ])

    const sender = res[0]
    const receiver = res[1]

    await Promise.all(range(1000).map(async (i) => {
      const data = Buffer.from(`this is message ${i}`)
      const hash = await multihashing(data, 'sha2-256')

      const m = new Message(false)
      const block = new Block(data, new CID(hash))
      m.addBlock(block)
      sender.engine.messageSent(receiver.peer, block)
      await receiver.engine.messageReceived(sender.peer, m)
    }))

    expect(sender.engine.numBytesSentTo(receiver.peer))
      .to.be.above(0)

    expect(sender.engine.numBytesSentTo(receiver.peer))
      .to.eql(receiver.engine.numBytesReceivedFrom(sender.peer))

    expect(receiver.engine.numBytesSentTo(sender.peer))
      .to.eql(0)

    expect(sender.engine.numBytesReceivedFrom(receiver.peer))
      .to.eql(0)
  })

  it('peer is added to peers when message received or sent', async () => {
    const res = await Promise.all([
      newEngine(false),
      newEngine(false)
    ])

    const sanfrancisco = res[0]
    const seattle = res[1]

    const m = new Message(true)
    sanfrancisco.engine.messageSent(seattle.peer)

    await seattle.engine.messageReceived(sanfrancisco.peer, m)

    expect(seattle.peer.toHexString())
      .to.not.eql(sanfrancisco.peer.toHexString())
    expect(sanfrancisco.engine.peers()).to.include(seattle.peer)
    expect(seattle.engine.peers()).to.include(sanfrancisco.peer)
  })

  it('partner wants then cancels', async function () {
    this.timeout(40 * 1000)

    const numRounds = 10
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
    const vowels = 'aeiou'.split('')
    const testCases = [
      [alphabet, vowels],
      [alphabet, difference(alphabet, vowels)]
    ]

    async function partnerWants (dEngine, values, partner) {
      const message = new Message(false)

      const hashes = await Promise.all(values.map((v) => multihashing(Buffer.from(v), 'sha2-256')))
      hashes.forEach((hash, i) => {
        message.addEntry(new CID(hash), Math.pow(2, 32) - 1 - i)
      })
      await dEngine.messageReceived(partner, message)
    }

    async function partnerCancels (dEngine, values, partner, cb) {
      const message = new Message(false)

      const hashes = await Promise.all(values.map((v) => multihashing(Buffer.from(v), 'sha2-256')))
      hashes.forEach((hash) => {
        message.cancel(new CID(hash))
      })
      await dEngine.messageReceived(partner, message, cb)
    }

    const repo = await createTempRepo()

    const hashes = await Promise.all(alphabet.map(v => multihashing(Buffer.from(v), 'sha2-256')))
    const blocks = hashes.map((h, i) => new Block(Buffer.from(alphabet[i]), new CID(h)))
    await Promise.all(blocks.map(b => repo.blocks.put(b)))

    for (let i = 0; i < numRounds; i++) {
      // 2 test cases
      //   a) want alphabet - cancel vowels
      //   b) want alphabet - cancels everything except vowels

      for (const testcase of testCases) {
        const set = testcase[0]
        const cancels = testcase[1]
        const keeps = difference(set, cancels)

        const network = mockNetwork(1, (res) => {
          const msgs = stringifyMessages(res.messages)
          expect(msgs.sort()).to.eql(keeps.sort())
        })

        const id = await promisify(PeerId.create)({ bits: 512 })
        const dEngine = new DecisionEngine(id, repo.blocks, network)
        dEngine.start()

        const partner = await promisify(PeerId.create)({ bits: 512 })
        await partnerWants(dEngine, set, partner)
        await partnerCancels(dEngine, cancels, partner)
      }
    }
  })

  it('splits large block messages', () => {
    const data = range(10).map((i) => {
      const b = Buffer.alloc(1024 * 256)
      b.fill(i)
      return b
    })

    return new Promise((resolve, reject) => {
      const net = mockNetwork(5, (res) => {
        res.messages.forEach((message) => {
          // The batch size is big enough to hold two blocks, so every
          // message should contain two blocks
          expect(message[1].blocks.size).to.eql(2)
        })
        resolve()
      })

      Promise.all([
        newEngine(net),
        Promise.all(data.map(async (d) => {
          const hash = await multihashing(d, 'sha2-256')
          return new Block(d, new CID(hash))
        }))
      ])
        .then(async (res) => {
          const sf = res[0].engine
          const id = res[0].peer

          const blocks = res[1]
          const cids = blocks.map((b) => b.cid)

          await Promise.all((blocks.map((b) => sf.blockstore.put(b))))
          const msg = new Message(false)
          cids.forEach((c, i) => msg.addEntry(c, Math.pow(2, 32) - 1 - i))

          sf.messageReceived(id, msg)
        })
        .catch(reject)
    })
  })
})
