/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const PeerId = require('peer-id')

const Ledger = require('../../src/decision/ledger')

describe('Ledger', () => {
  const p = PeerId.create()
  let ledger

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
