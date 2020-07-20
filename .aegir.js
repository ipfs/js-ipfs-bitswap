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
  },
  webpack: {
    node: {
      // needed by ipfs-repo-migrations
      path: true,

      // needed by dependencies of peer-id
      stream: true,

      // needed by core-util-is
      Buffer: true
    }
  }
}
