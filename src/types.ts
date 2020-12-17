import CID from 'cids'
import Block from 'ipld-block'

export type WantBlock = 0
export type HaveBlock = 1
export type WantType = WantBlock | HaveBlock

export type BlockData = {
  prefix: Uint8Array
  data: Uint8Array
}

export type Have = 0
export type DontHave = 1
export type BlockPresenceType = Have | DontHave

export type BlockPresence = {
  cid: Uint8Array
  type: BlockPresenceType
}

export type Entry = {
  block: Uint8Array
  priority: number
  cancel: boolean
  wantType?: WantType
  sendDontHave?: boolean
}

export type Message110 = {
  wantlist: WantList
  blockPresences: BlockPresence[]
  payload: BlockData[]

  pendingBytes?: number
}

export type Message100 = {
  wantlist: WantList
  blocks: Uint8Array[]

  pendingBytes?: number
}

export type WantList = {
  entries: Entry[]
  full?: boolean
}

export type AbortOptions = {
  signal: AbortSignal
}

export interface BlockStore {
  has(cid:CID, options?:AbortOptions):Promise<boolean>
  get(cid:CID, options?:AbortOptions):Promise<Block>
  put(block:Block, options?:AbortOptions):Promise<Block>
  putMany(blocks:AsyncIterable<Block>|Iterable<Block>, options?:AbortOptions):AsyncIterable<Block>
}

export type MessageProto = {
  encode(value:any): Uint8Array
  decode(bytes: Uint8Array): any
  BlockPresenceType: {
    Have: Have,
    DontHave: DontHave
  },
  Wantlist: {
    WantType: {
      Block: WantBlock
      Have: HaveBlock
    }
  }
}
