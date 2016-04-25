'use strict'

const PriorityQueue = require('./pq')

class ActivePartner {
  constructor () {
    // The number of blocks this peer is currently being sent.
    this.active = 0

    // The number of blocks this peer is currently requesting
    this.requests = 0

    // Queue of tasks belonging to this peer
    this.taskQueue = new PriorityQueue()

    this.activeBlocks = new Map()
  }

  startTask (key) {
    this.activeBlocks.set(key, {})
    this.active ++
  }

  taskDone (key) {
    this.activeBlocks.delete(key)
    this.active --

    if (this.active < 0) {
      throw new Error('more tasks finished than started')
    }
  }
}

module.exports = class PeerRequestQueue {
  constructor () {
    this.taskMap = new Map()
    this.partners = new Map()
    this.pQueue = new PriorityQueue(partnerCompare)
  }

  push (entry, to) {
    let partner = this.partners.get(to)

    if (!partner) {
      partner = new ActivePartner()
      this.pQueue.push(partner)
      this.partners.set(to, partner)
    }

    if (partner.activeBlocks.has(entry.key)) {
      return
    }

    let task = this.taskMap.get(taskKey(to, entry.key))

    if (task) {
      task.entry.priority = entry.priority
      partner.taskQueue.update(task)
      return
    }

    task = {
      entry: entry,
      target: to,
      created: +new Date(),
      done: () => {
        partner.taskDone(entry.Key)
        this.pQueue.update(partner)
      }
    }

    partner.taskQueue.push(task)
    this.taskMap.set(task.key, task)
    partner.requests ++
    partner.taskQueue.update(task)
  }
}

function taskKey (peerId, key) {
  return `${peerId}${key}`
}

function partnerCompare (a, b) {
  // having no blocks in their wantlist means lowest priority
	// having both of these checks ensures stability of the sort
  if (a.requests === 0) return false
  if (b.requests === 0) return true

  if (a.active === b.active) {
    // sorting by taskQueue.size() aids in cleaning out trash entries faster
		// if we sorted instead by requests, one peer could potentially build up
		// a huge number of cancelled entries in the queue resulting in a memory leak
    return a.taskQueue.size() > b.taskQueue.size()
  }

  return a.active < b.active
}
