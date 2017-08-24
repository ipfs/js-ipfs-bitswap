'use strict'

const _ = require('lodash')

exports.orderedFinish = (n, callback) => {
  const r = _.range(1, n + 1)
  const finishs = []

  return (i) => {
    finishs.push(i)
    if (finishs.length === n) {
      if (!_.isEqual(r, finishs)) {
        return callback(new Error('Invalid finish order: ' + finishs))
      }
      callback()
    }
  }
}
