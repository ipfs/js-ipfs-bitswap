/* eslint-env mocha */
'use strict'
const chai = require('chai')
const CID = require('cids')
const Block = require('ipld-block')
const { Buffer } = require('buffer')
const multihashing = require('multihashing-async')
const BitswapMessageEntry = require('../src/types/message/entry')

chai.use(require('dirty-chai'))
const expect = chai.expect
const { groupBy, uniqWith, pullAllWith, includesWith, sortBy, isMapEqual } = require('../src/utils')

describe('utils spec', function () {
  it('groupBy', () => {
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
  })

  it('pullAllWith', () => {
    var array = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]

    const actual = pullAllWith(
      (a, b) => (a.x === b.x && a.y === b.y),
      array,
      [{ x: 3, y: 4 }]
    )

    expect(actual).to.deep.equal([{ x: 1, y: 2 }, { x: 5, y: 6 }])
  })

  it('uniqWith', () => {
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
      return
    }

    throw new Error('no match')
  })

  it('includesWith', () => {
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
  })

  it('sortBy', () => {
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

    expect(groupedList1).to.be.deep.equal([{ id: 2, name: 'a' },
      { id: 3, name: 'b' },
      { id: 1, name: 'c' }])
    expect(groupedList2).to.be.deep.equal([{ id: 1, name: 'c' },
      { id: 2, name: 'a' },
      { id: 3, name: 'b' }])
  })

  describe('isMapEqual', () => {
    it('should on be false when !== size', () => {
      expect(isMapEqual(
        new Map([['key1', 'value1'], ['key2', 'value2']]),
        new Map([['key1', 'value1']])
      )).to.be.false()
    })

    it('should on be false if one key is missing', () => {
      expect(isMapEqual(
        new Map([['key1', 'value1'], ['key2', 'value2']]),
        new Map([['key1', 'value1'], ['key3', 'value2']])
      )).to.be.false()
    })

    it('should on be false if BitswapMessageEntry dont match', async () => {
      const hash1 = await multihashing(Buffer.from('OMG!1'), 'sha2-256')
      const cid1 = new CID(1, 'dag-pb', hash1)

      expect(isMapEqual(
        new Map([['key1', new BitswapMessageEntry(cid1, 1, true)], ['key2', new BitswapMessageEntry(cid1, 2, true)]]),
        new Map([['key1', new BitswapMessageEntry(cid1, 1, true)], ['key2', new BitswapMessageEntry(cid1, 1, true)]])
      )).to.be.false()
    })

    it('should on be true if BitswapMessageEntry match', async () => {
      const hash1 = await multihashing(Buffer.from('OMG!1'), 'sha2-256')
      const cid1 = new CID(1, 'dag-pb', hash1)

      expect(isMapEqual(
        new Map([['key1', new BitswapMessageEntry(cid1, 1, true)], ['key2', new BitswapMessageEntry(cid1, 1, true)]]),
        new Map([['key1', new BitswapMessageEntry(cid1, 1, true)], ['key2', new BitswapMessageEntry(cid1, 1, true)]])
      )).to.be.true()
    })

    it('should on be false if Blocks dont match', async () => {
      const hash1 = await multihashing(Buffer.from('OMG!1'), 'sha2-256')
      const cid1 = new CID(1, 'dag-pb', hash1)
      const block1 = new Block(Buffer.from('hello world'), cid1)
      const block2 = new Block(Buffer.from('hello world 2'), cid1)

      expect(isMapEqual(
        new Map([['key1', block1], ['key2', block1]]),
        new Map([['key1', block1], ['key2', block2]])
      )).to.be.false()
    })

    it('should on be true if Blocks match', async () => {
      const hash1 = await multihashing(Buffer.from('OMG!1'), 'sha2-256')
      const cid1 = new CID(1, 'dag-pb', hash1)
      const block1 = new Block(Buffer.from('hello world'), cid1)

      expect(isMapEqual(
        new Map([['key1', block1], ['key2', block1]]),
        new Map([['key1', block1], ['key2', block1]])
      )).to.be.true()
    })
  })
})
