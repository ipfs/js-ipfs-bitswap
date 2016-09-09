'use strict'

const debug = require('debug')
const pull = require('pull-stream')
const pushable = require('pull-pushable')

const Message = require('../message')

const log = debug('bitswap:wantmanager:queue')
log.error = debug('bitswap:wantmanager:queue:error')

module.exports = class MsgQueue {
  constructor (peerId, network) {
    this.p = peerId
    this.network = network
    this.refcnt = 1

    this.queue = pushable()
  }

  addMessage (msg) {
    log('addMessage: %s', this.p.toB58String(), msg)
    this.queue.push(msg)
  }

  addEntries (entries, full) {
    log('addEntries: %s', entries.length)
    const msg = new Message(Boolean(full))
    entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.key)
      } else {
        msg.addEntry(entry.key, entry.priority)
      }
    })

    this.addMessage(msg)
  }

  doWork (wlm, cb) {
    log('doWork: %s', this.p.toB58String(), wlm)
    if (wlm.empty) return cb()
    this.network.connectTo(this.p, (err) => {
      if (err) {
        log.error('cant connect to peer %s: %s', this.p.toB58String(), err.message)
        return cb()
      }
      log('sending message', wlm)
      this.network.sendMessage(this.p, wlm, (err) => {
        if (err) {
          log.error('send error: %s', err.message)
        }
        cb()
      })
    })
  }

  run () {
    log('starting queue')

    pull(
      this.queue,
      pull.asyncMap(this.doWork.bind(this)),
      pull.onEnd((err) => {
        if (err) {
          log.error('error processing message queue', err)
        }
        this.queue = pushable()
      })
    )
  }

  stop () {
    this.queue.end()
  }
}
