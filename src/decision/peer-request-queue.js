'use strict'

const PriorityQueue = require('./pq')

class PeerRequestTask {
  constructor (entry, target, done) {
    this.entry = entry
    this.target = target
    this.created = (new Date()).getTime()
    this.done = done
  }

  get key () {
    return taskKey(this.target, this.entry.key)
  }
}

class ActivePartner {
  constructor () {
    // The number of blocks this peer is currently being sent.
    this.active = 0

    // The number of blocks this peer is currently requesting
    this.requests = 0

    // Queue of tasks belonging to this peer
    this.taskQueue = new PriorityQueue(V1)

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

  // Add a new entry to the queue
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

    task = new PeerRequestTask(entry, to, () => {
      partner.taskDone(entry.key)
      this.pQueue.update(partner)
    })

    partner.taskQueue.push(task)
    this.taskMap.set(task.key, task)
    partner.requests ++
    partner.taskQueue.update(task)
  }

  // Get the task with the hightest priority from the queue
  pop () {
    if (this.pQueue.isEmpty()) return

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

      partner.startTask(out.entry.key)
      partner.requests --
      break
    }

    this.pQueue.push(partner)
    return out
  }

  // Remove a task from the queue
  remove (key, peerId) {
    const t = this.taskMap.get(taskKey(peerId, key))
    if (t) {
      // remove the task "lazily"
      // simply mark it as trash, so it'll be dropped when popped off the
      // queue.
      t.trash = true

      // having canceled a block, we now account for that in the given partner
      this.partners.get(peerId).requests --
    }
  }
}

function taskKey (peerId, key) {
  return `${peerId.toHexString()}:${key.toString('hex')}`
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
// A basic task comparator that returns tasks in the order created
function FIFO (a, b) {
  return a.created < b.created
}

// For the same target compare based on the wantlist priorities
// Otherwise fallback to oldest task first
function V1 (a, b) {
  if (a.target.toBytes() === b.target.toBytes()) {
    return a.entry.priority > b.entry.priority
  }

  return FIFO(a, b)
}
