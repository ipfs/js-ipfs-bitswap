'use strict'

const debug = require('debug')

const PriorityQueue = require('./../priority-queue')
const ActivePartner = require('./active-partner')
const PeerRequestTask = require('./peer-request-task')
const util = require('./util')
const taskKey = util.taskKey
const partnerCompare = util.partnerCompare

const log = debug('bitswap:peer-request-queue')

class PeerRequestQueue {
  constructor () {
    this.taskMap = new Map()
    this.partners = new Map()
    this.pQueue = new PriorityQueue(partnerCompare)
  }

  // Add a new entry to the queue
  push (entry, toPeerId) {
    const toPeerIdStr = toPeerId.toB58String()
    log('push, to: %s', toPeerIdStr)
    let partner = this.partners.get(toPeerIdStr)

    if (!partner) {
      partner = new ActivePartner(toPeerId)
      this.pQueue.push(partner)
      this.partners.set(toPeerIdStr, partner)
    }

    if (partner.activeBlocks.has(entry.cid)) {
      log('has activeBlocks', entry.cid)
      return
    }

    let task = this.taskMap.get(taskKey(toPeerId, entry.cid))

    if (task) {
      log('updating task', task.toString())
      task.entry.priority = entry.priority
      partner.taskQueue.update(task)
      return
    }

    task = new PeerRequestTask(entry, toPeerId, () => {
      partner.taskDone(entry.cid)
      this.pQueue.update(partner)
    })

    partner.taskQueue.push(task)
    log('taskMap.set', task.key, task.toString())
    this.taskMap.set(task.key, task)
    partner.requests++
    this.pQueue.update(partner)
  }

  // Get the task with the hightest priority from the queue
  pop () {
    if (this.pQueue.isEmpty()) {
      return
    }

    let partner = this.pQueue.pop()
    let out
    while (!partner.taskQueue.isEmpty()) {
      out = partner.taskQueue.pop()
      this.taskMap.delete(out.key)
      if (out.trash) {
        out = null
        // discarding tasks that have been removed
        continue
      }

      partner.startTask(out.entry.cid)
      partner.requests--
      break
    }
    this.pQueue.push(partner)
    return out
  }

  // Remove a task from the queue
  remove (cid, peerId) {
    const task = this.taskMap.get(taskKey(peerId, cid))
    if (task) {
      // remove the task "lazily" by simply marking it as trash,
      // so it'll be dropped when popped off the queue
      task.trash = true

      // having canceled a block, we now account for that in the
      // given partner
      const p = this.partners.get(peerId.toB58String())
      p.requests--
      this.pQueue.update(p)
    }

    log('taskMap', Array.from(this.taskMap.values()).map((v) => {
      return v.toString()
    }))
  }
}

module.exports = PeerRequestQueue
