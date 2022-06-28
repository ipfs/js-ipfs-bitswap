import { createEd25519PeerId } from '@libp2p/peer-id-factory'

/**
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 */

export async function makePeerId () {
  return (await makePeerIds(1))[0]
}

/**
 * @param {number} count
 * @returns {Promise<PeerId[]>}
 */
export async function makePeerIds (count) {
  const peerIds = await Promise.all([...new Array(count || 1)].map(() => {
    return createEd25519PeerId()
  }))
  return peerIds
}
