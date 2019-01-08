/* eslint-env mocha */
'use strict'
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const { groupBy, uniqWith, pullAllWith, includesWith, sortBy } = require('../src/utils')

describe('utils spec', function () {
  it('grouby', (done) => {
    const list = [
      { name: 'name1', score: 1 },
      { name: 'name2', score: 1 },
      { name: 'name3', score: 2 }
    ]
    const actual = groupBy(p => p.score === 1 ? 'a' : 'b', list)

    expect(actual).to.deep.equal({
      a: [
        { name: 'name1', score: 1 },
        { name: 'name2', score: 1 }
      ],
      b: [{ name: 'name3', score: 2 }]
    })

    done()
  })

  it('pullAllWith', (done) => {
    var array = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]

    const actual = pullAllWith(
      (a, b) => (a.x === b.x && a.y === b.y),
      array,
      [{ x: 3, y: 4 }]
    )

    expect(actual).to.deep.equal([{ x: 1, y: 2 }, { x: 5, y: 6 }])

    done()
  })

  it('uniqWith', (done) => {
    class T {
      constructor (id) {
        this.id = id
      }

      equals (instance) {
        return instance.id === this.id
      }
    }
    const list = [new T(1), new T(1), new T(2)]

    const r = uniqWith((a, b) => a.equals(b), list)

    if (r[0].id === 1 && r[1].id === 2) {
      return done()
    }

    return done(new Error('no match'))
  })

  it('includesWith', (done) => {
    class T {
      constructor (id) {
        this.id = id
      }

      equals (instance) {
        return instance.id === this.id
      }
    }
    const list = [new T(1), new T(2), new T(3)]

    const r1 = includesWith((a, b) => a.equals(b), new T(2), list)
    const r2 = includesWith((a, b) => a.equals(b), new T(4), list)
    expect(r1).to.be.true()
    expect(r2).to.be.false()

    done()
  })

  it('sortBy', (done) => {
    const list = [
      {
        id: 3,
        name: 'b'
      },
      {
        id: 2,
        name: 'a'
      },
      {
        id: 1,
        name: 'c'
      }
    ]

    const groupedList1 = sortBy(o => o.name, list)
    const groupedList2 = sortBy(o => o.id, list)

    expect(groupedList1).to.be.deep.equal([ { id: 2, name: 'a' },
      { id: 3, name: 'b' },
      { id: 1, name: 'c' } ])
    expect(groupedList2).to.be.deep.equal([ { id: 1, name: 'c' },
      { id: 2, name: 'a' },
      { id: 3, name: 'b' } ])

    done()
  })
})
