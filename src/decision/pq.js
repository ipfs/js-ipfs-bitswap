'use strict'

const Heap = require('heap')

module.exports = class PriorityQueue {
  constructor (cmp) {
    this.q = new Heap((a, b) => {
      return cmp(a, b) ? -1 : 1
    })
  }

  push (e) {
    this.q.push(e)
  }

  pop () {
    return this.q.pop()
  }

  update (e) {
    this.q.updateItem(e)
  }

  size () {
    return this.q.size()
  }

  isEmpty () {
    return this.q.empty()
  }
}
