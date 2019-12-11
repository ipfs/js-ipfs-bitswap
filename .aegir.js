'use strict'

module.exports = {
  bundlesize: { maxSize: '68kB' },
  karma: {
    files: [{
      pattern: 'test/test-data/**/*',
      watched: false,
      served: true,
      included: false
    }]
  }
}