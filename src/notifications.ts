import type { PeerId } from '@libp2p/interface-peer-id'
import type { AbortOptions } from '@libp2p/interfaces'
import type { Logger } from '@libp2p/logger'
import { EventEmitter } from 'events'
import type { CID } from 'multiformats/cid'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import * as CONSTANTS from './constants.js'
import { logger } from './utils/index.js'

const unwantEvent = (cid: CID) => `unwant:${uint8ArrayToString(cid.multihash.bytes, 'base64')}`

const blockEvent = (cid: CID) => `block:${uint8ArrayToString(cid.multihash.bytes, 'base64')}`

export class Notifications extends EventEmitter {
  private _log: Logger

  /**
   * Internal module used to track events about incoming blocks,
   * wants and unwants.
   */
  constructor (peerId: PeerId) {
    super()

    this.setMaxListeners(CONSTANTS.maxListeners)

    this._log = logger(peerId, 'notif')
  }

  /**
   * Signal the system that we received `block`.
   */
  hasBlock (cid: CID, block: Uint8Array) {
    const event = blockEvent(cid)
    this._log(event)
    this.emit(event, block)
  }

  /**
   * Signal the system that we are waiting to receive the
   * block associated with the given `cid`.
   * Returns a Promise that resolves to the block when it is received,
   * or undefined when the block is unwanted.
   */
  wantBlock (cid: CID, options: AbortOptions = {}): Promise<Uint8Array> {
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

      const onBlock = (data: Uint8Array) => {
        this.removeListener(unwantEvt, onUnwant)

        resolve(data)
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
   * Signal that the block is not wanted anymore
   */
  unwantBlock (cid: CID): void {
    const event = unwantEvent(cid)
    this._log(event)
    this.emit(event)
  }
}
