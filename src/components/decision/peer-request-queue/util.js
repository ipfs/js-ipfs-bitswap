function taskKey (peerId, cid) {
  return `${peerId.toB58String()}:${cid.toBaseEncodedString()}`
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

exports = module.exports
exports.taskKey = taskKey
exports.partnerCompare = partnerCompare
exports.FIFO = FIFO
exports.V1 = V1
