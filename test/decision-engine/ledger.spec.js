/* eslint-env mocha */

import { expect } from 'aegir/utils/chai.js'
import PeerId from 'peer-id'
import { Ledger } from '../../src/decision-engine/ledger.js'

describe('Ledger', () => {
  /** @type {PeerId} */
  let peerId
  /** @type {Ledger} */
  let ledger

  before(async () => {
    peerId = await PeerId.create({ bits: 512 })
  })

  beforeEach(() => {
    ledger = new Ledger(peerId)
  })

  it('accounts', () => {
    expect(ledger.debtRatio()).to.eql(0)

    ledger.sentBytes(100)
    ledger.sentBytes(12000)
    ledger.receivedBytes(223432)
    ledger.receivedBytes(2333)

    expect(ledger.accounting)
      .to.eql({
        bytesSent: 100 + 12000,
        bytesRecv: 223432 + 2333
      })
    expect(ledger.debtRatio())
      .to.eql((100 + 12000) / (223432 + 2333 + 1))
  })
})
