/* eslint-env mocha */
'use strict'

const expect = require('chai').expect

const PriorityQueue = require('../../../src/components/decision/pq')

describe('PriorityQueue', () => {
  it('sorts with a less operator', () => {
    const pq = new PriorityQueue((a, b) => a > b)
    pq.push(1)
    pq.push(5)
    pq.push(2)

    expect(pq.pop()).to.be.eql(5)
    expect(pq.pop()).to.be.eql(2)
    expect(pq.pop()).to.be.eql(1)
  })

  it('updates an element', () => {
    const a = {index: 1}
    const b = {index: 5}
    const c = {index: 2}
    const pq = new PriorityQueue((a, b) => a.index > b.index)

    pq.push(a)
    pq.push(b)
    pq.push(c)
    a.index = 10
    pq.update(a)

    expect(pq.pop()).to.be.eql(a)
    expect(pq.pop()).to.be.eql(b)
    expect(pq.pop()).to.be.eql(c)
  })

  it('isEmpty', () => {
    const pq = new PriorityQueue((a, b) => a > b)

    expect(pq.isEmpty()).to.be.eql(true)

    pq.push(1)

    expect(pq.isEmpty()).to.be.eql(false)

    pq.pop()

    expect(pq.isEmpty()).to.be.eql(true)
  })

  it('correct pop', () => {
    const pq = new PriorityQueue((a, b) => a.priority < b.priority)
    const tasks = [
      {key: 'a', priority: 9},
      {key: 'b', priority: 4},
      {key: 'c', priority: 3},
      {key: 'd', priority: 0},
      {key: 'e', priority: 6}
    ]
    tasks.forEach((t) => pq.push(t))
    const priorities = []

    while (!pq.isEmpty()) {
      priorities.push(pq.pop().priority)
    }

    expect(
      priorities
    ).to.be.eql([
      0, 3, 4, 6, 9
    ])
  })
})
