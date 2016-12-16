'use strict'

const queue = require('async/queue')
const debug = require('debug')

const Message = require('../../types/message')

const log = debug('bitswap:wantmanager:queue')
log.error = debug('bitswap:wantmanager:queue:error')

class MessageQueue {
  constructor (peerId, network) {
    this.peerId = peerId
    this.peerIdStr = peerId.toB58String()
    this.network = network
    this.refcnt = 1

    this.queue = queue(this.doWork.bind(this), 1)
    this.queue.pause()
  }

  addMessage (msg) {
    if (msg.empty) {
      return
    }
    log('addMessage: %s', this.peerIdStr, msg)
    this.queue.push(msg)
  }

  addEntries (entries, full) {
    log('addEntries: %s', entries.length)
    const msg = new Message(Boolean(full))

    entries.forEach((entry) => {
      if (entry.cancel) {
        msg.cancel(entry.cid)
      } else {
        msg.addEntry(entry.cid, entry.priority)
      }
    })

    this.addMessage(msg)
  }

  doWork (wlm, cb) {
    log('doWork: %s', this.peerIdStr, wlm)

    if (wlm.empty) {
      return cb()
    }

    this.network.connectTo(this.peerId, (err) => {
      if (err) {
        log.error('cant connect to peer %s: %s', this.peerIdStr, err.message)
        return cb(err)
      }
      log('sending message', wlm)

      this.network.sendMessage(this.peerId, wlm, (err) => {
        if (err) {
          log.error('send error: %s', err.message)
          return cb(err)
        }
        cb()
      })
    })
  }

  run () {
    log('starting queue')
    this.queue.resume()
  }

  stop () {
    log('killing queue')
    this.queue.kill()
  }
}

module.exports = MessageQueue
