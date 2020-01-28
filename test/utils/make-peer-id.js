'use strict'

const PeerId = require('peer-id')

module.exports = async (count) => {
  const peerIds = await Promise.all([...new Array(count || 1)].map(() => {
    return PeerId.create({ bits: 512 })
  }))
  return count ? peerIds : peerIds[0]
}
