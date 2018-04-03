'use strict'

/* eslint-disable no-console */

const distributionTest = require('../utils/distribution-test')
const print = require('./helpers/print-swarm-results')

print('10 nodes, 10 blocks, 5 iterations', distributionTest(10, 10, 5, (err) => {
  if (err) {
    throw err
  }

  console.log('Finished. Can kill now...')
}))
