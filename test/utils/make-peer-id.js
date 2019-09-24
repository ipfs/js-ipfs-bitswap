'use strict'

const PeerId = require('peer-id')
const promisify = require('promisify-es6')

module.exports = async (count) => {
  const peerIds = await Promise.all([...new Array(count || 1)].map(() => {
    return promisify(PeerId.create)({ bits: 512 })
  }))
  return count ? peerIds : peerIds[0]
}
