'use strict'

module.exports = {
  bundlesize: { maxSize: '210kB' },
  karma: {
    files: [{
      pattern: 'test/test-data/**/*',
      watched: false,
      served: true,
      included: false
    }]
  }
}