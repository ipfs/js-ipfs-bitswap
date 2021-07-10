'use strict'

const Bitswap = require('./bitswap')

/**
 * @typedef {import('./types').IPFSBitswap} IPFSBitswap
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('./types/message')} BitswapMessage
 * @typedef {import('interface-blockstore').Blockstore} Blockstore
 * @typedef {import('interface-blockstore').Pair} Pair
 * @typedef {import('interface-blockstore').Options} Options
 * @typedef {import('multiformats/hashes/interface').MultihashHasher} MultihashHasher
 */

/**
 * @param {import('libp2p')} libp2p
 * @param {Blockstore} blockstore
 * @param {Object} [options]
 * @param {boolean} [options.statsEnabled=false]
 * @param {number} [options.statsComputeThrottleTimeout=1000]
 * @param {number} [options.statsComputeThrottleMaxQueueSize=1000]
 * @param {Record<number, MultihashHasher>} [options.hashers]
 * @returns {IPFSBitswap}
 */
const createBitswap = (libp2p, blockstore, options = {}) => {
  return new Bitswap(libp2p, blockstore, options)
}

module.exports = {
  createBitswap
}
