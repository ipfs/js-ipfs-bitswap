'use strict'

const mh = require('multihashes')
const debug = require('debug')
const assert = require('assert')

const PriorityQueue = require('./pq')

const log = debug('bitswap:peer-request-queue')

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

  get [Symbol.toStringTag] () {
    return `PeerRequestTask <target: ${this.target.toB58String()}, entry: ${this.entry.toString()}>`
  }
}

class ActivePartner {
  constructor (id) {
    this.id = id

    // The number of blocks this peer is currently being sent.
    this.active = 0

    // The number of blocks this peer is currently requesting
    this.requests = 0

    // Queue of tasks belonging to this peer
    this.taskQueue = new PriorityQueue(V1)

    this.activeBlocks = new Map()
  }

  startTask (key) {
    this.activeBlocks.set(mh.toB58String(key), 1)
    this.active ++
  }

  taskDone (key) {
    const k = mh.toB58String(key)
    assert(this.activeBlocks.has(k), 'finishing non existent task')

    this.activeBlocks.delete()
    this.active --

    assert(this.active >= 0, 'more tasks finished than started')
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
    log('push, to: %s', to.toB58String())
    let partner = this.partners.get(to.toB58String())

    if (!partner) {
      partner = new ActivePartner(to)
      this.pQueue.push(partner)
      this.partners.set(to.toB58String(), partner)
    }

    if (partner.activeBlocks.has(entry.key)) {
      log('has activeBlocks', entry.key)
      return
    }

    let task = this.taskMap.get(taskKey(to, entry.key))

    if (task) {
      log('updating task', task.toString())
      task.entry.priority = entry.priority
      partner.taskQueue.update(task)
      return
    }

    task = new PeerRequestTask(entry, to, () => {
      partner.taskDone(entry.key)
      this.pQueue.update(partner)
    })

    partner.taskQueue.push(task)
    log('taskMap.set', task.key, task.toString())
    this.taskMap.set(task.key, task)
    partner.requests ++
    partner.taskQueue.update(task)
  }

  // Get the task with the hightest priority from the queue
  pop () {
    // log('pop, empty? %s', this.pQueue.isEmpty())
    // log('partners', Array.from(this.partners.values()).map((val) => [val.requests, val.taskQueue.size()]))
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
    // log('pop, out', partner.taskQueue.isEmpty(), out)
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
      this.partners.get(peerId.toB58String()).requests --
    }

    log('taskMap', Array.from(this.taskMap.values()).map((v) => {
      return v.toString()
    }))
  }
}

function taskKey (peerId, key) {
  return `${peerId.toB58String()}:${mh.toB58String(key)}`
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
