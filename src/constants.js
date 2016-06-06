'use strict'

const second = 1000

module.exports = {
  maxProvidersPerRequest: 3,
  providerRequestTimeout: 10 * second,
  hasBlockTimeout: 15 * second,
  provideTimeout: 15 * second,
  kMaxPriority: Math.pow(2, 31) - 1,
  rebroadcastDelay: 10 * second,
  maxListeners: 1000
}
