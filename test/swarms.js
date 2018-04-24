'use strict'

/* eslint-env mocha */
/* eslint-disable no-console */

const stats = require('stats-lite')
const distributionTest = require('./utils/distribution-test')
const test = it

describe.skip('swarms', () => {
  const print = Boolean(process.env.PRINT)

  after(() => {
    process.exit()
  })

  test('2 nodes, 2 blocks', function (done) {
    this.timeout(10 * 1000)

    maybePrint('2 nodes, 2 blocks', distributionTest(2, 2, done))
  })

  test('10 nodes, 2 blocks', function (done) {
    this.timeout(30 * 1000)

    maybePrint('10 nodes, 2 blocks', distributionTest(10, 2, done))
  })

  test('10 nodes, 10 blocks', function (done) {
    this.timeout(30 * 1000)

    maybePrint('10 nodes, 10 blocks', distributionTest(10, 10, 1, done))
  })

  test('10 nodes, 20 blocks', function (done) {
    this.timeout(30 * 1000)

    maybePrint('10 nodes, 20 blocks', distributionTest(10, 20, done))
  })

  test('50 nodes, 2 blocks', function (done) {
    this.timeout(600 * 1000)

    maybePrint('50 nodes, 2 blocks', distributionTest(50, 2, done))
  })

  test.skip('100 nodes, 2 blocks', function (done) {
    this.timeout(600 * 1000)
    maybePrint('100 nodes, 2 blocks', distributionTest(100, 2, done))
  })

  test('10 nodes, 100 blocks', function (done) {
    this.timeout(600 * 1000)
    maybePrint('10 nodes, 100 blocks', distributionTest(10, 100, done))
  })

  function maybePrint (suite, emitter) {
    if (!print) {
      return
    }
    const elapseds = []
    emitter.once('start', () => {
      console.log('\n------------------------')
      console.log(suite)
      console.log('started')
    })
    emitter.once('all connected', () => {
      console.log('all nodes connected to each other')
    })
    emitter.once('stop', () => {
      console.log('stopping')
    })
    emitter.once('stopped', () => {
      console.log('stopped')
      console.log('stats:')
      console.log('---------')
      console.log('mean: %s', stats.mean(elapseds))
      console.log('median: %s', stats.median(elapseds))
      console.log('variance: %s', stats.variance(elapseds))
      console.log('standard deviation: %s', stats.stdev(elapseds))
      console.log('85th percentile: %s', stats.percentile(elapseds, 0.85))
    })

    emitter.on('got block', (elapsed) => {
      elapseds.push(elapsed)
    })
  }
})
