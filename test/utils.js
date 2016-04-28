'use strict'

const async = require('async')

exports.mockNetwork = (calls, done) => {
  done = done || (() => {})
  const connects = []
  const messages = []
  let i = 0

  const finish = () => {
    i++
    if (i === calls) {
      done({connects, messages})
    }
  }

  return {
    connectTo (p, cb) {
      async.setImmediate(() => {
        connects.push(p)
        cb()
      })
    },
    sendMessage (p, msg, cb) {
      async.setImmediate(() => {
        messages.push([p, msg])
        cb()
        finish()
      })
    }
  }
}
