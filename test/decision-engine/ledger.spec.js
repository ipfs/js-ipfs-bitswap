/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')

const Ledger = require('../../src/decision-engine/ledger')

describe('Ledger', () => {
  let peerId
  let ledger

  before((done) => {
    PeerId.create({bits: 1024}, (err, _peerId) => {
      if (err) {
        return done(err)
      }

      peerId = _peerId
      done()
    })
  })

  beforeEach(() => {
    ledger = new Ledger(peerId)
  })

  it('accounts', () => {
    ledger.sentBytes(100)
    ledger.sentBytes(12000)
    ledger.receivedBytes(223432)
    ledger.receivedBytes(2333)

    expect(ledger.accounting)
      .to.eql({
        bytesSent: 100 + 12000,
        bytesRecv: 223432 + 2333
      })
  })
})
