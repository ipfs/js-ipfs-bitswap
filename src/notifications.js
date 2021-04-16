'use strict'

const { EventEmitter } = require('events')
const IPLDBlock = require('ipld-block')
const uint8ArrayEquals = require('uint8arrays/equals')
const uint8ArrayToString = require('uint8arrays/to-string')

const CONSTANTS = require('./constants')
const logger = require('./utils').logger

/**
 * @typedef {import('ipld-block')} Block
 */

/**
 * @param {CID} cid
 */
const unwantEvent = (cid) => `unwant:${uint8ArrayToString(cid.multihash, 'base64')}`

/**
 * @param {CID} cid
 */
const blockEvent = (cid) => `block:${uint8ArrayToString(cid.multihash, 'base64')}`

class Notifications extends EventEmitter {
  /**
   * Internal module used to track events about incoming blocks,
   * wants and unwants.
   *
   * @param {PeerId} peerId
   */
  constructor (peerId) {
    super()

    this.setMaxListeners(CONSTANTS.maxListeners)

    this._log = logger(peerId, 'notif')
  }

  /**
   * Signal the system that we received `block`.
   *
   * @param {Block} block
   * @returns {void}
   */
  hasBlock (block) {
    const event = blockEvent(block.cid)
    this._log(event)
    this.emit(event, block)
  }

  /**
   * Signal the system that we are waiting to receive the
   * block associated with the given `cid`.
   * Returns a Promise that resolves to the block when it is received,
   * or undefined when the block is unwanted.
   *
   * @param {CID} cid
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Block>}
   */
  wantBlock (cid, options = {}) {
    if (!cid) {
      throw new Error('Not a valid cid')
    }

    const blockEvt = blockEvent(cid)
    const unwantEvt = unwantEvent(cid)

    this._log(`wantBlock:${cid}`)

    return new Promise((resolve, reject) => {
      const onUnwant = () => {
        this.removeListener(blockEvt, onBlock)
        reject(new Error(`Block for ${cid} unwanted`))
      }

      /**
       * @param {Block} block
       */
      const onBlock = (block) => {
        this.removeListener(unwantEvt, onUnwant)

        if (!uint8ArrayEquals(cid.multihash, block.cid.multihash)) {
          // wrong block
          return reject(new Error(`Incorrect block received for ${cid}`))
        } else if (cid.version !== block.cid.version || cid.codec !== block.cid.codec) {
          // right block but wrong version or codec
          block = new IPLDBlock(block.data, cid)
        }

        resolve(block)
      }

      this.once(unwantEvt, onUnwant)
      this.once(blockEvt, onBlock)

      if (options && options.signal) {
        options.signal.addEventListener('abort', () => {
          this.removeListener(blockEvt, onBlock)
          this.removeListener(unwantEvt, onUnwant)

          reject(new Error(`Want for ${cid} aborted`))
        })
      }
    })
  }

  /**
   * Signal that the block is not wanted anymore.
   *
   * @param {CID} cid - the CID of the block that is not wanted anymore.
   * @returns {void}
   */
  unwantBlock (cid) {
    const event = unwantEvent(cid)
    this._log(event)
    this.emit(event)
  }
}

module.exports = Notifications

/**
 * @typedef {import('cids')} CID
 * @typedef {import('peer-id')} PeerId
 */
