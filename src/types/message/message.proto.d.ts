
export interface MessageProto {
  decode: (bytes: Uint8Array) => MessageData
  encode: (value: Message100|Message110) => Uint8Array
  BlockPresenceType: {
    Have: Have
    DontHave: DontHave
  }
  Wantlist: {
    WantType: {
      Block: WantBlock
      Have: HaveBlock
    }
  }
}

export interface MessageData {
  wantlist?: WantList
  blockPresences: BlockPresence[]

  blocks: Uint8Array[]
  payload: Block[]

  pendingBytes: number
}

export interface Message110 {
  wantlist: WantList
  blockPresences: BlockPresence[]

  payload: Block[]
  pendingBytes: number
}

export interface Message100 {
  wantlist: WantList

  blocks: Uint8Array[]
}

export interface BlockPresence {
  cid: Uint8Array
  type: BlockPresenceType
}

export interface WantList {
  entries: Entry[]
  full?: boolean
}

export type WantBlock = 0
export type HaveBlock = 1
export type WantType = WantBlock | HaveBlock

export type Have = 0
export type DontHave = 1
export type BlockPresenceType = Have | DontHave

export interface Entry {
  block: Uint8Array
  priority: number
  cancel: boolean
  wantType?: WantType
  sendDontHave?: boolean
}

export interface Block {
  prefix: Uint8Array
  data: Uint8Array
}

declare var Message: MessageProto
export { Message }
