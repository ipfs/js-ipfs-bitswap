/* eslint-env mocha */
'use strict'

const async = require('async')
const _ = require('lodash')
const expect = require('chai').expect
const PeerId = require('peer-id')
const Block = require('ipfs-block')

const Message = require('../src/message')
const Bitswap = require('../src')

module.exports = (repo) => {
  describe('bitswap', () => {
    describe('receive message', () => {
      let store

      beforeEach((done) => {
        repo.create('hello', (err, r) => {
          if (err) return done(err)
          store = r.datastore
          done()
        })
      })

      afterEach((done) => {
        repo.remove(done)
      })

      it('simple block message', (done) => {
        const me = PeerId.create({bit: 64})
        const libp2p = {}
        const bs = new Bitswap(me, libp2p, store)

        const other = PeerId.create({bit: 64})
        const b1 = new Block('hello')
        const b2 = new Block('world')
        const msg = new Message(false)
        msg.addBlock(b1)
        msg.addBlock(b2)

        bs._receiveMessage(other, msg, (err) => {
          if (err) throw err

          expect(bs.blocksRecvd).to.be.eql(2)
          expect(bs.dupBlocksRecvd).to.be.eql(0)

          async.parallel([
            (cb) => store.get(b1.key, (err, res) => {
              if (err) cb(err)
              expect(res).to.be.eql(b1)
              cb()
            }),
            (cb) => store.get(b1.key, (err, res) => {
              if (err) return cb(err)
              expect(res).to.be.eql(b1)
              cb()
            })
          ], done)
        })
      })

      it('simple want message', (done) => {
        const me = PeerId.create({bit: 64})
        const libp2p = {}
        const bs = new Bitswap(me, libp2p, store)

        const other = PeerId.create({bit: 64})
        const b1 = new Block('hello')
        const b2 = new Block('world')
        const msg = new Message(false)
        msg.addEntry(b1.key, 1, false)
        msg.addEntry(b2.key, 1, false)

        bs._receiveMessage(other, msg, (err) => {
          if (err) throw err

          expect(bs.blocksRecvd).to.be.eql(0)
          expect(bs.dupBlocksRecvd).to.be.eql(0)

          const wl = bs.wantlistForPeer(other)
          expect(wl.has(b1.key)).to.be.eql(true)
          expect(wl.has(b2.key)).to.be.eql(true)

          done()
        })
      })

      it('multi peer', (done) => {
        const me = PeerId.create({bit: 64})
        const libp2p = {}
        const bs = new Bitswap(me, libp2p, store)

        const others = _.range(5).map(() => PeerId.create({bit: 64}))
        const blocks = _.range(10).map((i) => new Block(`hello ${i}`))
        const messages = _.range(5).map((i) => {
          const m = new Message(false)
          m.addBlock(blocks[i])
          m.addBlock(blocks[5 + i])
          return m
        })
        let i = 0
        async.eachSeries(others, (other, cb) => {
          const msg = messages[i]
          i++
          bs._receiveMessage(other, msg, (err) => {
            if (err) return cb(err)
            hasBlocks(msg, store, cb)
          })
        }, done)
      })
    })
  })

  describe.only('getBlock', () => {
    let store

    before((done) => {
      repo.create('hello', (err, r) => {
        if (err) return done(err)
        store = r.datastore
        done()
      })
    })

    after((done) => {
      repo.remove(done)
    })

    it('block exists locally', (done) => {
      const me = PeerId.create({bit: 64})
      const libp2p = {}
      const block = new Block('hello')
      store.put(block, (err) => {
        if (err) throw err
        const bs = new Bitswap(me, libp2p, store)

        bs.getBlock(block.key, (err, res) => {
          if (err) throw err

          expect(res).to.be.eql(block)
          done()
        })
      })
    })

    it('block is retrived from peer', () => {

    })

    it('block is added locally afterwards', () => {

    })
  })
}

function hasBlocks (msg, store, cb) {
  async.each(Array.from(msg.blocks.values()), (b, next) => {
    if (!b.cancel) {
      store.has(b.key, next)
    } else {
      next()
    }
  }, cb)
}
