/* eslint-env mocha */

'use strict'

const expect = require('chai').expect
const utils = require('../utils')
const async = require('async')

describe('gen Bitswap network', function () {
  this.timeout(300 * 1000)

  it('gen a network with 2 bitswap nodes', (done) => {
    const n = 2
    utils.genBitswapNetwork(n, (err, nodeArr) => {
      expect(err).to.not.exist
      nodeArr.forEach((node) => {
        expect(node.bitswap).to.exist
        expect(node.peerInfo).to.exist
        expect(node.libp2p).to.exist
        expect(Object.keys(node.libp2p.swarm.muxedConns).length).to.equal(n - 1)
        expect(node.repo).to.exist
      })
      cleanUp(nodeArr)
    })

    function cleanUp (nodeArr) {
      // setTimeout is used to avoid closing the TCP socket while spdy is
      // still sending a ton of signalling data
      setTimeout(() => {
        async.each(nodeArr, (node, callback) => {
          node.libp2p.swarm.close(callback)
        }, done)
      }, 1000)
    }
  })

  it('gen a network with 3 bitswap nodes', (done) => {
    const n = 3
    utils.genBitswapNetwork(n, (err, nodeArr) => {
      expect(err).to.not.exist
      nodeArr.forEach((node) => {
        expect(node.bitswap).to.exist
        expect(node.peerInfo).to.exist
        expect(node.libp2p).to.exist
        expect(Object.keys(node.libp2p.swarm.conns).length).to.equal(0)
        expect(Object.keys(node.libp2p.swarm.muxedConns).length).to.equal(n - 1)
        expect(node.repo).to.exist
      })
      cleanUp(nodeArr)
    })

    function cleanUp (nodeArr) {
      // setTimeout is used to avoid closing the TCP socket while spdy is
      // still sending a ton of signalling data
      const tasks = nodeArr.map((node) => {
        return (cb) => {
          node.libp2p.swarm.close(cb)
        }
      })

      setTimeout(() => {
        async.parallel(tasks, done)
      }, 1000)
    }
  })
})
