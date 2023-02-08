import { Bitswap } from './bitswap.js'
import type { Blockstore } from 'interface-blockstore'
import type { PeerId } from '@libp2p/interface-peer-id'
import type { CID } from 'multiformats/cid'
import type { Message } from './message/message'
import type { IMovingAverage } from '@vascosantos/moving-average'
import type { MultihashHasher } from 'multiformats/hashes/interface'
import type { Libp2p } from '@libp2p/interface-libp2p'

export interface WantListEntry {
  cid: CID
  priority: number
  wantType: Message.Wantlist.WantType
  inc: () => void
  dec: () => void
  hasRefs: () => boolean
}

export interface Wantlist {
  length: number
  add: (cid: CID, priority: number, wantType: Message.Wantlist.WantType) => void
  remove: (cid: CID) => void
  removeForce: (cid: string) => void
  forEach: (fn: (entry: WantListEntry, key: string) => void) => void
  sortedEntries: () => Map<string, WantListEntry>
  contains: (cid: CID) => boolean
  get: (cid: CID) => WantListEntry
}

export interface Ledger {
  peer: PeerId
  value: number
  sent: number
  recv: number
  exchanged: number
}

export interface Stat {
  enable: () => void
  disable: () => void
  stop: () => void
  snapshot: Record<string, bigint>
  movingAverages: Record<string, Record<number, IMovingAverage>>
  push: (counter: string, inc: number) => void
}

export interface Stats {
  snapshot: Record<string, bigint>
  movingAverages: Record<string, Record<number, IMovingAverage>>
  enable: () => void
  disable: () => void
  stop: () => void
  forPeer: (peerId: PeerId | string) => Stat | undefined
  push: (peer: string, counter: string, inc: number) => void
}

export interface IPFSBitswap extends Blockstore {
  peerId: PeerId
  isStarted: () => boolean
  enableStats: () => void
  disableStats: () => void
  wantlistForPeer: (peerId: PeerId) => Map<string, WantListEntry>
  ledgerForPeer: (peerId: PeerId) => Ledger | null
  unwant: (cids: CID | CID[]) => void
  cancelWants: (cids: CID | CID[]) => void
  getWantlist: () => IterableIterator<[string, WantListEntry]>
  peers: () => PeerId[]
  stat: () => Stats
  start: () => void
  stop: () => void
  unwrap: () => Blockstore
}

export interface MultihashHasherLoader {
  getHasher: (codeOrName: number | string) => Promise<MultihashHasher>
}

export interface BitswapOptions {
  /**
   * Whether stats are enabled. Default: false
   */
  statsEnabled?: boolean

  /**
   * Default: 1000
   */
  statsComputeThrottleTimeout?: number

  /**
   * Default: 1000
   */
  statsComputeThrottleMaxQueueSize?: number

  /**
   * Default: 32
   */
  maxInboundStreams?: number

  /**
   * Default: 128
   */
  maxOutboundStreams?: number

  /**
   * Default: 30000
   */
  incomingStreamTimeout?: number

  /**
   * Enables loading esoteric hash functions
   */
  hashLoader?: MultihashHasherLoader
}

export const createBitswap = (libp2p: Libp2p, blockstore: Blockstore, options: BitswapOptions = {}): IPFSBitswap => {
  return new Bitswap(libp2p, blockstore, options)
}
