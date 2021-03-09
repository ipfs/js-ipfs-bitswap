'use strict'

/* eslint-disable no-console */

const distributionTest = require('../utils/distribution-test')
const print = require('./helpers/print-swarm-results')
const { EventEmitter } = require('events')

;(async function () {
  const emitter = new EventEmitter()

  print('10 nodes, 10 blocks, 5 iterations', emitter)

  await distributionTest(10, 10, 5, emitter)

  console.log('Finished. Can kill now...')
})()
