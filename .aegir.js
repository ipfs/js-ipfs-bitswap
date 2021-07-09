'use strict'
const path = require('path')

/** @type {import('aegir').Options["build"]["config"]} */
const esbuild = {
  // this will inject all the named exports from 'node-globals.js' as globals
  inject: [require.resolve('./scripts/node-globals.js')],
  plugins: [
    {
      name: 'node built ins', // this will make the bundler resolve node builtins to the respective browser polyfill
      setup (build) {
        build.onResolve({ filter: /^stream$/ }, () => {
          return { path: require.resolve('readable-stream') }
        })
      }
    }
  ]
}

/** @type {import('aegir').PartialOptions} */
module.exports = {
  test: {
    browser :{
      config: {
        buildConfig: esbuild
      }
    }
  },
  build: {
    bundlesizeMax: '44KB',
    config: esbuild
  }
}
