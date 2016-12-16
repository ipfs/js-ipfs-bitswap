'use strict'

const assert = require('assert')
const V1 = require('./util').V1
const PriorityQueue = require('../priority-queue')

class ActivePartner {
  constructor (_peerId) {
    this.peerId = _peerId

    // The number of blocks this peer is currently being sent.
    this.active = 0

    // The number of blocks this peer is currently requesting
    this.requests = 0

    // Queue of tasks belonging to this peer
    this.taskQueue = new PriorityQueue(V1)

    this.activeBlocks = new Map()
  }

  startTask (cid) {
    const cidStr = cid.toBaseEncodedString()
    this.activeBlocks.set(cidStr, 1)
    this.active++
  }

  taskDone (cid) {
    const cidStr = cid.toBaseEncodedString()
    assert(this.activeBlocks.has(cidStr), 'finishing non existent task')

    this.activeBlocks.delete()
    this.active--

    assert(this.active >= 0, 'more tasks finished than started')
  }
}

module.exports = ActivePartner
