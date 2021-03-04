'use strict'

const PeerId = require('peer-id')

async function makePeerId () {
  return (await makePeerIds(1))[0]
}

/**
 * @param {number} count
 * @returns {Promise<PeerId[]>}
 */
async function makePeerIds (count) {
  const peerIds = await Promise.all([...new Array(count || 1)].map(() => {
    return PeerId.create({ bits: 512 })
  }))
  return peerIds
}

module.exports = {
  makePeerId,
  makePeerIds
}
