/* eslint-env mocha */
'use strict'

const expect = require('chai').expect

const PriorityQueue = require('../../src/decision/pq')

describe('PriorityQueue', () => {
  it('sorts with a less operator', () => {
    const pq = new PriorityQueue((a, b) => a < b)
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
    const pq = new PriorityQueue((a, b) => a.index < b.index)

    pq.push(a)
    pq.push(b)
    pq.push(c)
    a.index = 10
    pq.update(a)

    expect(pq.pop()).to.be.eql(a)
    expect(pq.pop()).to.be.eql(b)
    expect(pq.pop()).to.be.eql(c)
  })
})
