import debounce from 'just-debounce-it'
import { BitswapMessage as Message } from '../message/index.js'
import { logger } from '../utils/index.js'
import { wantlistSendDebounceMs } from '../constants.js'
import type { PeerId } from '@libp2p/interface-peer-id'
import type { Network } from '../network.js'
import type { CID } from 'multiformats/cid'
import type { Logger } from '@libp2p/logger'

export class MsgQueue {
  public peerId: PeerId
  public refcnt: number
  private network: Network
  private _entries: Array<{cid:CID, priority:number, cancel?:boolean}>
  private _log: Logger

  constructor (selfPeerId: PeerId, otherPeerId: PeerId, network: Network) {
    this.peerId = otherPeerId
    this.network = network
    this.refcnt = 1
    this._entries = []
    this._log = logger(selfPeerId, 'msgqueue')
    this.sendEntries = debounce(this.sendEntries.bind(this), wantlistSendDebounceMs)
  }

  addMessage (msg: Message) {
    if (msg.empty) {
      return
    }

    this.send(msg)
  }

  addEntries (entries: Array<{cid:CID, priority:number}>) {
    this._entries = this._entries.concat(entries)
    this.sendEntries()
  }

  sendEntries () {
    if (!this._entries.length) {
      return
    }

    const msg = new Message(false)
    this._entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.cid)
      } else {
        msg.addEntry(entry.cid, entry.priority)
      }
    })
    this._entries = []
    this.addMessage(msg)
  }

  async send (msg: Message) {
    try {
      await this.network.connectTo(this.peerId)
    } catch (err: any) {
      this._log.error('cant connect to peer %p: %s', this.peerId, err.message)
      return
    }

    this._log('sending message to peer %p', this.peerId)

    // Note: Don't wait for sendMessage() to complete
    this.network.sendMessage(this.peerId, msg).catch((err) => {
      this._log.error('send error', err)
    })
  }
}
