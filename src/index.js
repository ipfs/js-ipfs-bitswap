import { Bitswap } from './bitswap.js'

/**
 * @typedef {import('./types').IPFSBitswap} IPFSBitswap
 * @typedef {import('./types').MultihashHasherLoader} MultihashHasherLoader
 * @typedef {import('@libp2p/interface-peer-id').PeerId} PeerId
 * @typedef {import('./message')} BitswapMessage
 * @typedef {import('interface-blockstore').Blockstore} Blockstore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('interface-blockstore').Options} Options
 */

/**
 * @param {import('libp2p').Libp2p} libp2p
 * @param {Blockstore} blockstore
 * @param {object} [options]
 * @param {boolean} [options.statsEnabled=false]
 * @param {number} [options.statsComputeThrottleTimeout=1000]
 * @param {number} [options.statsComputeThrottleMaxQueueSize=1000]
 * @param {number} [options.maxInboundStreams=32]
 * @param {number} [options.maxOutboundStreams=128]
 * @param {number} [options.incomingStreamTimeout=30000]
 * @param {MultihashHasherLoader} [options.hashLoader]
 * @returns {IPFSBitswap}
 */
export const createBitswap = (libp2p, blockstore, options = {}) => {
  return new Bitswap(libp2p, blockstore, options)
}
