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
const makeBlock = require('../utils/make-block')
const makePeerId = require('../utils/make-peer-id')

const mockNetwork = require('../utils/mocks').mockNetwork
const sum = (nums) => nums.reduce((a, b) => a + b, 0)

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

    async function partnerCancels (dEngine, values, partner) {
      const message = new Message(false)

      const hashes = await Promise.all(values.map((v) => multihashing(Buffer.from(v), 'sha2-256')))
      hashes.forEach((hash) => {
        message.cancel(new CID(hash))
      })
      await dEngine.messageReceived(partner, message)
    }

    async function peerSendsBlocks (dEngine, repo, blocks, peer) {
      // Bitswap puts blocks into the blockstore then passes the blocks to the
      // Decision Engine
      await repo.blocks.putMany(blocks)
      await dEngine.receivedBlocks(blocks)
    }

    const hashes = await Promise.all(alphabet.map(v => multihashing(Buffer.from(v), 'sha2-256')))
    const blocks = hashes.map((h, i) => new Block(Buffer.from(alphabet[i]), new CID(h)))
    const id = await promisify(PeerId.create)({ bits: 512 })
    const partner = await promisify(PeerId.create)({ bits: 512 })
    const somePeer = await promisify(PeerId.create)({ bits: 512 })

    for (let i = 0; i < numRounds; i++) {
      // 2 test cases
      //   a) want alphabet - cancel vowels
      //   b) want alphabet - cancels everything except vowels

      for (const testcase of testCases) {
        const set = testcase[0]
        const cancels = testcase[1]
        const keeps = difference(set, cancels)

        let network
        const done = new Promise((resolve, reject) => {
          network = mockNetwork(1, (res) => {
            const msgs = stringifyMessages(res.messages)
            expect(msgs.sort()).to.eql(keeps.sort())
            resolve()
          })
        })

        const repo = await createTempRepo()
        const dEngine = new DecisionEngine(id, repo.blocks, network)
        dEngine.start()

        // Send wants then cancels for some of the wants
        await partnerWants(dEngine, set, partner)
        await partnerCancels(dEngine, cancels, partner)

        // Simulate receiving blocks from the network
        await peerSendsBlocks(dEngine, repo, blocks, somePeer)

        await done
      }
    }
  })

  it('round-robins incoming wants', async () => {
    const id = await makePeerId(1)[0]
    const peers = await makePeerId(3)
    const blockSize = 256 * 1024
    const blocks = await makeBlock(20, blockSize)

    const blockIndex = (block) => {
      for (const [i, b] of blocks.entries()) {
        if (b.cid.equals(block.cid)) {
          return i
        }
      }
      return -1
    }

    const repo = await createTempRepo()
    await repo.blocks.putMany(blocks)

    let network
    let rcvdBlockCount = 0
    const received = new Map(peers.map(p => [p.toB58String(), { count: 0, bytes: 0 }]))
    const done = new Promise((resolve) => {
      network = mockNetwork(blocks.length, null, ([peer, msg]) => {
        const pid = peer.toB58String()
        const rcvd = received.get(pid)

        // Blocks should arrive in priority order.
        // Note: we requested the blocks such that the priority order was
        // highest at the start to lowest at the end.
        for (const block of msg.blocks.values()) {
          expect(blockIndex(block)).to.gte(rcvd.count)
        }

        rcvd.count += msg.blocks.size
        rcvd.bytes += sum([...msg.blocks.values()].map(b => b.data.length))

        // pendingBytes should be equal to the remaining data we're expecting
        expect(msg.pendingBytes).to.eql(blockSize * blocks.length - rcvd.bytes)

        // Expect each peer to receive blocks in a roughly round-robin fashion,
        // in other words one peer shouldn't receive a bunch more blocks than
        // the others at any given time.
        for (const p of peers) {
          if (p !== peer) {
            const pCount = received.get(p.toB58String()).count
            expect(rcvd.count - pCount).to.lt(blocks.length * 0.8)
          }
        }

        // When all peers have received all the blocks, we're done
        rcvdBlockCount += msg.blocks.size
        if (rcvdBlockCount === blocks.length * peers.length) {
          // Make sure each peer received all blocks it was expecting
          for (const peer of peers) {
            const pid = peer.toB58String()
            const rcvd = received.get(pid)
            expect(rcvd.count).to.eql(blocks.length)
          }
          resolve()
        }
      })
    })

    const dEngine = new DecisionEngine(id, repo.blocks, network)
    dEngine.start()

    // Each peer requests all blocks
    for (const peer of peers) {
      const message = new Message(false)
      for (const [i, block] of blocks.entries()) {
        message.addEntry(block.cid, blocks.length - i)
      }
      await dEngine.messageReceived(peer, message)
    }

    await done
  })

  it('sends received blocks to peers that want them', async () => {
    const [id, peer] = await makePeerId(2)
    const blocks = await makeBlock(4, 8 * 1024)

    let network
    const receiveMessage = new Promise(resolve => {
      network = mockNetwork(blocks.length, null, resolve)
    })
    const repo = await createTempRepo()
    const dEngine = new DecisionEngine(id, repo.blocks, network, null, { maxSizeReplaceHasWithBlock: 0 })
    dEngine.start()

    const message = new Message(false)
    message.addEntry(blocks[0].cid, 4, Message.WantType.Have, false)
    message.addEntry(blocks[1].cid, 3, Message.WantType.Have, false)
    message.addEntry(blocks[2].cid, 2, Message.WantType.Block, false)
    message.addEntry(blocks[3].cid, 1, Message.WantType.Block, false)
    await dEngine.messageReceived(peer, message)

    // Simulate receiving message - put blocks into the blockstore then pass
    // them to the Decision Engine
    const rcvdBlocks = [blocks[0], blocks[2]]
    await repo.blocks.putMany(rcvdBlocks)
    await dEngine.receivedBlocks(rcvdBlocks)

    // Wait till the engine sends a message
    const [toPeer, msg] = await receiveMessage

    // Expect the message to be sent to the peer that wanted the blocks
    expect(toPeer.toB58String()).to.eql(peer.toB58String())
    // Expect the correct wanted block
    expect(msg.blocks.size).to.eql(1)
    expect(msg.blocks.has(blocks[2].cid.toString())).to.eql(true)
    // Expect the correct wanted HAVE
    expect(msg.blockPresences.size).to.eql(1)
    expect(msg.blockPresences.has(blocks[0].cid.toString())).to.eql(true)
    expect(msg.blockPresences.get(blocks[0].cid.toString())).to.eql(Message.BlockPresenceType.Have)
  })

  it('sends DONT_HAVE', async () => {
    const [id, peer] = await makePeerId(2)
    const blocks = await makeBlock(4, 8 * 1024)

    let onMsg
    const receiveMessage = () => new Promise(resolve => {
      onMsg = resolve
    })
    const network = mockNetwork(blocks.length, null, (res) => {
      onMsg(res)
    })
    const repo = await createTempRepo()
    const dEngine = new DecisionEngine(id, repo.blocks, network, null, { maxSizeReplaceHasWithBlock: 0 })
    dEngine.start()

    const message = new Message(false)
    message.addEntry(blocks[0].cid, 4, Message.WantType.Have, false, false)
    message.addEntry(blocks[1].cid, 3, Message.WantType.Have, false, true) // send dont have
    message.addEntry(blocks[2].cid, 2, Message.WantType.Block, false, false)
    message.addEntry(blocks[3].cid, 1, Message.WantType.Block, false, true) // send dont have
    await dEngine.messageReceived(peer, message)

    // Wait till the engine sends a message
    const [toPeer, msg] = await receiveMessage()

    // Expect DONT_HAVEs for blocks 1 and 3
    expect(toPeer.toB58String()).to.eql(peer.toB58String())
    expect(msg.blockPresences.size).to.eql(2)
    for (const block of [blocks[1], blocks[3]]) {
      const cid = block.cid.toString()
      expect(msg.blockPresences.has(cid)).to.eql(true)
      expect(msg.blockPresences.get(cid)).to.eql(Message.BlockPresenceType.DontHave)
    }

    // Simulate receiving message with blocks - put blocks into the blockstore
    // then pass them to the Decision Engine
    await repo.blocks.putMany(blocks)
    await dEngine.receivedBlocks(blocks)

    const [toPeer2, msg2] = await receiveMessage()
    expect(toPeer2.toB58String()).to.eql(peer.toB58String())
    expect(msg2.blocks.size).to.eql(2)
    expect(msg2.blockPresences.size).to.eql(2)
    for (const block of [blocks[0], blocks[1]]) {
      const cid = block.cid.toString()
      expect(msg2.blockPresences.has(cid)).to.eql(true)
      expect(msg2.blockPresences.get(cid)).to.eql(Message.BlockPresenceType.Have)
    }
  })

  it('handles want-have and want-block', async () => {
    const [id, partner] = await makePeerId(2)

    const alphabet = 'abcdefghijklmnopqrstuvwxyz'
    const vowels = 'aeiou'

    const alphabetLs = alphabet.split('')
    const hashes = await Promise.all(alphabetLs.map(v => multihashing(Buffer.from(v), 'sha2-256')))
    const blocks = hashes.map((h, i) => new Block(Buffer.from(alphabetLs[i]), new CID(h)))

    let testCases = [
      // Just send want-blocks
      {
        wls: [
          {
            wantBlks: vowels,
            sendDontHave: false
          }
        ],
        exp: {
          blks: vowels
        }
      },

      // Send want-blocks and want-haves
      {
        wls: [
          {
            wantBlks: vowels,
            wantHaves: 'fgh',
            sendDontHave: false
          }
        ],
        exp: {
          blks: vowels,
          haves: 'fgh'
        }
      },

      // Send want-blocks and want-haves, with some want-haves that are not
      // present, but without requesting DONT_HAVES
      {
        wls: [
          {
            wantBlks: vowels,
            wantHaves: 'fgh123',
            sendDontHave: false
          }
        ],
        exp: {
          blks: vowels,
          haves: 'fgh'
        }
      },

      // Send want-blocks and want-haves, with some want-haves that are not
      // present, and request DONT_HAVES
      {
        wls: [
          {
            wantBlks: vowels,
            wantHaves: 'fgh123',
            sendDontHave: true
          }
        ],
        exp: {
          blks: vowels,
          haves: 'fgh',
          dontHaves: '123'
        }
      },

      // Send want-blocks and want-haves, with some want-blocks and want-haves that are not
      // present, but without requesting DONT_HAVES
      {
        wls: [
          {
            wantBlks: 'aeiou123',
            wantHaves: 'fgh456',
            sendDontHave: false
          }
        ],
        exp: {
          blks: 'aeiou',
          haves: 'fgh',
          dontHaves: ''
        }
      },

      // Send want-blocks and want-haves, with some want-blocks and want-haves that are not
      // present, and request DONT_HAVES
      {
        wls: [
          {
            wantBlks: 'aeiou123',
            wantHaves: 'fgh456',
            sendDontHave: true
          }
        ],
        exp: {
          blks: 'aeiou',
          haves: 'fgh',
          dontHaves: '123456'
        }
      },

      // Send repeated want-blocks
      {
        wls: [
          {
            wantBlks: 'ae',
            sendDontHave: false
          },
          {
            wantBlks: 'io',
            sendDontHave: false
          },
          {
            wantBlks: 'u',
            sendDontHave: false
          }
        ],
        exp: {
          blks: 'aeiou'
        }
      },

      // Send repeated want-blocks and want-haves
      {
        wls: [
          {
            wantBlks: 'ae',
            wantHaves: 'jk',
            sendDontHave: false
          },
          {
            wantBlks: 'io',
            wantHaves: 'lm',
            sendDontHave: false
          },
          {
            wantBlks: 'u',
            sendDontHave: false
          }
        ],
        exp: {
          blks: 'aeiou',
          haves: 'jklm'
        }
      },

      // Send repeated want-blocks and want-haves, with some want-blocks and want-haves that are not
      // present, and request DONT_HAVES
      {
        wls: [
          {
            wantBlks: 'ae12',
            wantHaves: 'jk5',
            sendDontHave: true
          },
          {
            wantBlks: 'io34',
            wantHaves: 'lm',
            sendDontHave: true
          },
          {
            wantBlks: 'u',
            wantHaves: '6',
            sendDontHave: true
          }
        ],
        exp: {
          blks: 'aeiou',
          haves: 'jklm',
          dontHaves: '123456'
        }
      },

      // Send want-block then want-have for same CID
      {
        wls: [
          {
            wantBlks: 'a',
            sendDontHave: true
          },
          {
            wantHaves: 'a',
            sendDontHave: true
          }
        ],
        // want-have should be ignored because there was already a
        // want-block for the same CID in the queue
        exp: {
          blks: 'a'
        }
      },

      // Send want-have then want-block for same CID
      {
        wls: [
          {
            wantHaves: 'b',
            sendDontHave: true
          },
          {
            wantBlks: 'b',
            sendDontHave: true
          }
        ],
        // want-block should overwrite existing want-have
        exp: {
          blks: 'b'
        }
      },

      // Send want-block then want-block for same CID
      {
        wls: [
          {
            wantBlks: 'a',
            sendDontHave: true
          },
          {
            wantBlks: 'a',
            sendDontHave: true
          }
        ],
        // second want-block should be ignored
        exp: {
          blks: 'a'
        }
      },

      // Send want-have then want-have for same CID
      {
        wls: [
          {
            wantHaves: 'a',
            sendDontHave: true
          },
          {
            wantHaves: 'a',
            sendDontHave: true
          }
        ],
        // second want-have should be ignored
        exp: {
          haves: 'a'
        }
      }
    ]

    async function partnerWantBlocksHaves (dEngine, wantBlks, wantHaves, sendDontHave, partner) {
      const wantTypes = [
        [wantBlks, Message.WantType.Block],
        [wantHaves, Message.WantType.Have]
      ]

      let i = wantBlks.length + wantHaves.length
      const message = new Message(false)
      for (const [wants, type] of wantTypes) {
        const hashes = await Promise.all(wants.map((v) => multihashing(Buffer.from(v), 'sha2-256')))
        for (const hash of hashes) {
          message.addEntry(new CID(hash), i--, type, false, sendDontHave)
        }
      }
      await dEngine.messageReceived(partner, message)
    }

    let onMsg
    const nextMessage = () => {
      return new Promise(resolve => {
        onMsg = resolve
        dEngine._processTasks()
      })
    }
    const network = mockNetwork(blocks.length, null, ([peer, msg]) => {
      onMsg && onMsg(msg)
      onMsg = undefined
    })

    const repo = await createTempRepo()
    await repo.blocks.putMany(blocks)
    const dEngine = new DecisionEngine(id, repo.blocks, network, null, { maxSizeReplaceHasWithBlock: 0 })
    dEngine._scheduleProcessTasks = () => {}
    dEngine.start()

    const onlyCases = []
    for (const testCase of testCases) {
      if (testCase.only) {
        onlyCases.push(testCase)
      }
    }
    if (onlyCases.length) {
      testCases = onlyCases
    }

    for (const [, testCase] of Object.entries(testCases)) {
      // console.log("Test case %d:", i)
      for (const wl of testCase.wls) {
        // console.log("  want-blocks '%s' / want-haves '%s' / sendDontHave %s",
        //   wl.wantBlks || '', wl.wantHaves || '', wl.sendDontHave)
        const wantBlks = (wl.wantBlks || '').split('')
        const wantHaves = (wl.wantHaves || '').split('')
        await partnerWantBlocksHaves(dEngine, wantBlks, wantHaves, wl.sendDontHave, partner)
      }

      const expBlks = (testCase.exp.blks || '').split('')
      const expHaves = (testCase.exp.haves || '').split('')
      const expDontHaves = (testCase.exp.dontHaves || '').split('')

      const msg = await nextMessage()

      // Expect the correct number of blocks and block presences
      expect(msg.blocks.size).to.eql(expBlks.length)
      expect(msg.blockPresences.size).to.eql(expHaves.length + expDontHaves.length)

      // Expect the correct block contents
      for (const expBlk of expBlks) {
        const hash = await multihashing(Buffer.from(expBlk), 'sha2-256')
        expect(msg.blocks.has(new CID(hash).toString()))
      }

      // Expect the correct HAVEs
      for (const expHave of expHaves) {
        const hash = await multihashing(Buffer.from(expHave), 'sha2-256')
        const cid = new CID(hash).toString()
        expect(msg.blockPresences.has(cid)).to.eql(true)
        expect(msg.blockPresences.get(cid)).to.eql(Message.BlockPresenceType.Have)
      }

      // Expect the correct DONT_HAVEs
      for (const expDontHave of expDontHaves) {
        const hash = await multihashing(Buffer.from(expDontHave), 'sha2-256')
        const cid = new CID(hash).toString()
        expect(msg.blockPresences.has(cid)).to.eql(true)
        expect(msg.blockPresences.get(cid)).to.eql(Message.BlockPresenceType.DontHave)
      }
    }
  })
})
