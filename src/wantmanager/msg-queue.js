'use strict'

const debug = require('debug')

const Message = require('./message')

const log = debug('bitswap:wantmanager:queue')
log.error = debug('bitswap:wantmanager:queue:error')

module.exports = class MsgQueue {
  constructor (peerId, network) {
    this.p = peerId
    this.out = null
    this.network = network
    this.refcnt = 1
  }

  addMessage (entries) {
    if (this.out == null) {
      this.out = new Message(false)
    }

    for (let entry of entries.values()) {
      if (entry.cancel) {
        this.out.cancel(entry.key)
      } else {
        this.out.addEntry(entry.key, entry.priority)
      }
    }
  }

  doWork (done) {
    this.network.connectTo(this.p, (err) => {
      if (err) {
        log('cant connect to peer %s: %s', this.p.toHexString(), err.message)
        return done()
      }

      const wlm = this.out

      if (wlm == null || wlm.empty) {
        // Nothing to do here
        return done()
      }

      this.out = null

      this.network.sendMessage(this.p, wlm, (err) => {
        if (err) {
          log('send error: %s', err.message)
        }

        done()
      })
    })
  }

  run () {
    // TODO: implement me
  }

  stop () {
    // TODO: implment me
    // is this needed?
  }
}
