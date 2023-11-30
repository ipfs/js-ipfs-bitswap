import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import type { PeerId } from '@libp2p/interface'

export async function makePeerId (): Promise<PeerId> {
  return (await makePeerIds(1))[0]
}

export async function makePeerIds (count: number): Promise<PeerId[]> {
  const peerIds = await Promise.all([...new Array(count ?? 1)].map(async () => {
    return createEd25519PeerId()
  }))
  return peerIds
}
