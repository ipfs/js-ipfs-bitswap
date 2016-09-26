/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')

const Ledger = require('../../src/decision/ledger')

describe('Ledger', () => {
  let p
  let ledger

  before((done) => {
    PeerId.create((err, id) => {
      if (err) {
        return done(err)
      }

      p = id
      done()
    })
  })
  beforeEach(() => {
    ledger = new Ledger(p)
  })

  it('accounts', () => {
    ledger.sentBytes(100)
    ledger.sentBytes(12000)
    ledger.receivedBytes(223432)
    ledger.receivedBytes(2333)

    expect(
      ledger.accounting
    ).to.be.eql({
      bytesSent: 100 + 12000,
      bytesRecv: 223432 + 2333
    })
  })
})
