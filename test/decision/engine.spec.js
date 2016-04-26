/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')
const _ = require('lodash')
const Block = require('ipfs-blocks').Block

const Message = require('../../src/message')
const Engine = require('../../src/decision/engine')

function newEngine (id) {
  const store = {
    has: () => {}
  }
  return {
    peer: new PeerId(id),
    store: store,
    engine: new Engine(store)
  }
}

describe('Engine', () => {
  it('consistent accounting', () => {
    const sender = newEngine('Ernie')
    const receiver = newEngine('Bert')

    _.range(1000).forEach((i) => {
      const m = new Message(false)
      const content = `this is message ${i}`
      m.addBlock(new Block(content))

      sender.engine.messageSent(receiver.peer, m)
      receiver.engine.messageReceived(sender.Peer, m)
    })

    expect(
      sender.engine.numBytesSentTo(receiver.peer)
    ).to.be.above(
      0
    )

    expect(
      sender.engine.numBytesSentTo(receiver.peer)
    ).to.be.eql(
      receiver.engine.numBytesReceivedFrom(sender.peers)
    )

    expect(
      receiver.engine.numBytesSentTo(sender.peer)
    ).to.be.eql(
      0
    )

    expect(
      sender.engine.numBytesReceivedFrom(receiver.peer)
    ).to.be.eql(
      0
    )
  })

  it('peer is added to peers when message receiver or sent', () => {
    const sanfrancisco = newEngine('sf')
    const seatlle = newEngine('sea')

    const m = new Message(true)

    sanfrancisco.engine.messageSent(seatlle.peer, m)
    seatlle.engine.messageReceived(sanfrancisco.peer, m)

    expect(
      seatlle.peer.toHexString()
    ).to.not.be.eql(
      sanfrancisco.peer.toHexString()
    )

    expect(
      sanfrancisco.engine.peers()
    ).to.include(
      seatlle.peer
    )

    expect(
      seatlle.engine.peers()
    ).to.include(
      sanfrancisco.peer
    )
  })

  it('partner wants then cancels', () => {
    const numRounds = global.window ? 2 : 10
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
    const vowels = 'aeiou'.split('')
    const testCases = [
      [alphabet, vowels],
      [alphabet, _.difference(alphabet, vowels)]
    ]

    const BlockStore = function () {
      this.store = new Map()

      this.has = (key) => {
        return this.store.has(key.toString('hex'))
      }
      this.put = (block) => {
        this.store.set(block.key.toString('hex'), block)
      }
      this.get = (key) => {
        return this.store.get(key.toString('hex'))
      }
    }

    const bs = new BlockStore()

    alphabet.forEach((letter) => {
      const block = new Block(letter)
      bs.put(block)
    })

    const partnerWants = (e, keys, p) => {
      const add = new Message(false)
      keys.forEach((letter, i) => {
        const block = new Block(letter)
        add.addEntry(block.key, Math.pow(2, 32) - 1 - i)
      })
      e.messageReceived(p, add)
    }

    const partnerCancels = (e, keys, p) => {
      const cancels = new Message(false)
      keys.forEach((k) => {
        const block = new Block(k)
        cancels.cancel(block.key)
      })
      e.messageReceived(p, cancels)
    }

    const checkHandledInOrder = (e, keys) => {
      keys.forEach((k) => {
        const next = e.outbox().next()
        const envelope = next.value
        const received = envelope.block
        const expected = new Block(k)

        expect(
          received.key.toString('hex')
        ).to.be.eql(
          expected.key.toString('hex')
        )
      })
    }

    _.range(numRounds).forEach(() => {
      testCases.forEach((testcase) => {
        const set = testcase[0]
        const cancels = testcase[1]
        const keeps = _.difference(set, cancels)

        const e = new Engine(bs)
        const partner = PeerId.create({bits: 64})

        partnerWants(e, set, partner)
        partnerCancels(e, cancels, partner)
        checkHandledInOrder(e, keeps)
      })
    })
  })
})
