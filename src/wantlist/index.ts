
import { WantListEntry as Entry } from './entry.js'
import { base58btc } from 'multiformats/bases/base58'
import { Message } from '../message/message.js'
import { trackedMap } from '@libp2p/tracked-map'
import type { Stats } from '../stats/index.js'
import type { Libp2p } from '@libp2p/interface-libp2p'
import type { CID } from 'multiformats/cid'

const WantType = {
  Block: Message.Wantlist.WantType.Block,
  Have: Message.Wantlist.WantType.Have
}

const sortBy = <T> (fn: (v:T) => number, list: T[]): T[] => {
  return Array.prototype.slice.call(list, 0).sort((a, b) => {
    const aa = fn(a)
    const bb = fn(b)
    return aa < bb ? -1 : aa > bb ? 1 : 0
  })
}

export class Wantlist {
  static Entry = Entry

  private set: Map<string, Entry>
  private _stats?: Stats

  constructor (stats?: Stats, libp2p?: Libp2p) {
    this.set = libp2p
      ? trackedMap({
        name: 'ipfs_bitswap_wantlist',
        metrics: libp2p.metrics
      })
      : new Map()
    this._stats = stats
  }

  get length () {
    return this.set.size
  }

  add (cid: CID, priority: number, wantType: Message.Wantlist.WantType) {
    const cidStr = cid.toString(base58btc)
    const entry = this.set.get(cidStr)

    if (entry) {
      entry.inc()
      entry.priority = priority

      // We can only overwrite want-have with want-block
      if (entry.wantType === WantType.Have && wantType === WantType.Block) {
        entry.wantType = wantType
      }
    } else {
      this.set.set(cidStr, new Entry(cid, priority, wantType))
      if (this._stats != null) {
        this._stats.push(undefined, 'wantListSize', 1)
      }
    }
  }

  remove (cid: CID) {
    const cidStr = cid.toString(base58btc)
    const entry = this.set.get(cidStr)

    if (!entry) {
      return
    }

    entry.dec()

    // only delete when no refs are held
    if (entry.hasRefs()) {
      return
    }

    this.set.delete(cidStr)
    if (this._stats) {
      this._stats.push(undefined, 'wantListSize', -1)
    }
  }

  removeForce (cidStr: string) {
    if (this.set.has(cidStr)) {
      this.set.delete(cidStr)
    }
  }

  forEach (fn: (entry:Entry, key:string) => void) {
    return this.set.forEach(fn)
  }

  entries () {
    return this.set.entries()
  }

  sortedEntries () {
    // TODO: Figure out if this is an actual bug.
    // @ts-expect-error - Property 'key' does not exist on type 'WantListEntry'
    return new Map(sortBy(o => o[1].key, Array.from(this.set.entries())))
  }

  contains (cid: CID) {
    const cidStr = cid.toString(base58btc)
    return this.set.has(cidStr)
  }

  get (cid: CID) {
    const cidStr = cid.toString(base58btc)
    return this.set.get(cidStr)
  }
}
