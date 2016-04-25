'use strict'

const Heap = require('heap')

module.exports = class PriorityQueue {

  // less is a function that returns true if a is less than b
  // and false otherwise
  constructor (less) {
    this.q = new Heap((a, b) => {
      return less(a, b) ? 1 : -1
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
}
