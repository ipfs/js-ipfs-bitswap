'use strict'

const EventEmitter = require('events').EventEmitter

const CONSTANTS = require('./constants')
const logger = require('./utils').logger

const unwantEvent = (c) => `unwant:${c}`
const blockEvent = (c) => `block:${c}`

/**
 * Internal module used to track events about incoming blocks,
 * wants and unwants.
 *
 * @param {PeerId} peerId
 * @private
 */
class Notifications extends EventEmitter {
  constructor (peerId) {
    super()

    this.setMaxListeners(CONSTANTS.maxListeners)

    this._log = logger(peerId, 'notif')

    this._unwantListeners = {}
    this._blockListeners = {}
  }

  /**
   * Signal the system that we received `block`.
   *
   * @param {Block} block
   * @return {void}
   */
  hasBlock (block) {
    const cidStr = block.cid.toString('base58btc')
    const str = `block:${cidStr}`
    this._log(str)
    this.emit(str, block)
  }

  /**
   * Signal the system that we are waiting to receive the
   * block associated with the given `cid`.
   * Returns a Promise that resolves to the block when it is received,
   * or undefined when the block is unwanted.
   *
   * @param {CID} cid
   * @returns {Promise<Block>}
   */
  wantBlock (cid) {
    const cidStr = cid.toString('base58btc')
    this._log(`wantBlock:${cidStr}`)

    return new Promise((resolve, reject) => {
      this._unwantListeners[cidStr] = () => {
        this._log(`manual unwant: ${cidStr}`)
        this._cleanup(cidStr)
        resolve()
      }

      this._blockListeners[cidStr] = (block) => {
        this._cleanup(cidStr)
        resolve(block)
      }

      this.once(
        unwantEvent(cidStr),
        this._unwantListeners[cidStr]
      )
      this.once(
        blockEvent(cidStr),
        this._blockListeners[cidStr]
      )
    })
  }

  /**
   * Signal that the block is not wanted anymore.
   *
   * @param {CID} cid - the CID of the block that is not wanted anymore.
   * @returns {void}
   */
  unwantBlock (cid) {
    const str = `unwant:${cid.toString('base58btc')}`
    this._log(str)
    this.emit(str)
  }

  /**
   * Internal method to clean up once a block was received or unwanted.
   *
   * @private
   * @param  {string} cidStr
   * @returns {void}
   */
  _cleanup (cidStr) {
    if (this._unwantListeners[cidStr]) {
      this.removeListener(
        unwantEvent(cidStr),
        this._unwantListeners[cidStr]
      )
      delete this._unwantListeners[cidStr]
    }

    if (this._blockListeners[cidStr]) {
      this.removeListener(
        blockEvent(cidStr),
        this._blockListeners[cidStr]
      )
      delete this._blockListeners[cidStr]
    }
  }
}

module.exports = Notifications
