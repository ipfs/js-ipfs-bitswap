'use strict'

const taskKey = require('./util').taskKey

class PeerRequestTask {
  constructor (entry, target, done) {
    this.entry = entry
    this.target = target
    this.created = (new Date()).getTime()
    this.done = done
  }

  get key () {
    return taskKey(this.target, this.entry.cid)
  }

  get [Symbol.toStringTag] () {
    return `PeerRequestTask <target: ${this.target.toB58String()}, entry: ${this.entry.toString()}>`
  }
}

module.exports = PeerRequestTask
