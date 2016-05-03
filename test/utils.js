'use strict'

const async = require('async')
const _ = require('lodash')
const PeerId = require('peer-id')
const Bitswap = require('../src')

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

exports.createMockNet = (repo, count, cb) => {
  async.map(_.range(count), (i, cb) => repo.create(`repo-${i}`, (err, res) => {
    if (err) return cb(err)
    cb(null, res.datastore)
  }), (err, stores) => {
    if (err) return cb(err)

    const ids = _.range(count).map((i) => PeerId.create({bits: 64}))
    const hexIds = ids.map((id) => id.toHexString())
    const bitswaps = _.range(count).map((i) => new Bitswap(ids[i], {}, stores[i]))
    const networks = _.range(count).map((i) => {
      return {
        connectTo (id, cb) {
          const done = (err) => async.setImmediate(() => cb(err))
          if (!_.includes(hexIds, id.toHexString())) {
            return done(new Error('unkown peer'))
          }
          done()
        },
        sendMessage (id, msg, cb) {
          const j = _.findIndex(hexIds, (el) => el === id.toHexString())
          bitswaps[j]._receiveMessage(ids[i], msg, cb)
        }
      }
    })

    _.range(count).forEach((i) => {
      exports.applyNetwork(bitswaps[i], networks[i])
    })

    cb(null, {
      ids,
      stores,
      bitswaps,
      networks
    })
  })
}

exports.applyNetwork = (bs, n) => {
  bs.network = n
  bs.wm.network = n
  bs.engine.network = n
}
