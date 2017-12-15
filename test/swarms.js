'use strict'

/* eslint-env mocha */

const distributionTest = require('./utils/distribution-test')
const test = it

describe('swarms', () => {
  test('2 nodes, 2 blocks', function (done) {
    this.timeout(10 * 1000)
    distributionTest(2, 2, done)
  })

  test('10 nodes, 2 blocks', function (done) {
    this.timeout(30 * 1000)
    distributionTest(10, 2, done)
  })

  test('50 nodes, 2 blocks', function (done) {
    this.timeout(300 * 1000)
    distributionTest(50, 2, done)
  })

  test.skip('100 nodes, 2 blocks', function (done) {
    this.timeout(300 * 1000)
    distributionTest(100, 2, done)
  })

  test('10 nodes, 100 blocks', function (done) {
    this.timeout(300 * 1000)
    distributionTest(10, 100, done)
  })
})
