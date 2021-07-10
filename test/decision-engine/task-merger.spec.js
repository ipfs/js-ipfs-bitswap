/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const PeerId = require('peer-id')

const RequestQueue = require('../../src/decision-engine/req-queue')
const TaskMerger = require('../../src/decision-engine/task-merger')

/**
 * @typedef {object} Task
 * @property {string} topic
 * @property {number} priority
 * @property {number} size
 * @property {object} data
 * @property {boolean} data.isWantBlock
 * @property {number} data.blockSize
 * @property {boolean} data.haveBlock
 * @property {boolean} data.sendDontHave
 */

describe('Task Merger', () => {
  /** @type {PeerId} */
  let peerId

  before(async () => {
    peerId = await PeerId.create({ bits: 512 })
  })

  it('push have vs block', () => {
    const wantHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantBlock = {
      topic: '1',
      priority: 10,
      size: 10,
      data: {
        isWantBlock: true,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }

    /**
     * @param {Task[]} tasks
     * @param {boolean} expIsWantBlock
     */
    const runTestCase = (tasks, expIsWantBlock) => {
      tasks = cloneTasks(tasks)

      const rq = new RequestQueue(TaskMerger)
      rq.pushTasks(peerId, tasks)

      const popped = rq.popTasks(100).tasks
      expect(popped.length).to.eql(1)
      expect(popped[0].data.isWantBlock).to.eql(expIsWantBlock)
    }

    const wantBlockType = true
    const wantHaveType = false

    // should ignore second want-have
    runTestCase([wantHave, wantHave], wantHaveType)
    // should ignore second want-block
    runTestCase([wantBlock, wantBlock], wantBlockType)
    // want-have does not overwrite want-block
    runTestCase([wantBlock, wantHave], wantBlockType)
    // want-block overwrites want-have
    runTestCase([wantHave, wantBlock], wantBlockType)
  })

  it('push size info', () => {
    const wantBlockBlockSize = 10
    const wantBlockDontHaveBlockSize = 0
    const wantHaveBlockSize = 10
    const wantHaveDontHaveBlockSize = 0

    const wantBlock = {
      topic: '1',
      priority: 10,
      size: 10,
      data: {
        isWantBlock: true,
        blockSize: wantBlockBlockSize,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantBlockDontHave = {
      topic: '1',
      priority: 10,
      size: 2,
      data: {
        isWantBlock: true,
        blockSize: wantBlockDontHaveBlockSize,
        haveBlock: false,
        sendDontHave: false
      }
    }
    const wantHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: wantHaveBlockSize,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantHaveDontHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: wantHaveDontHaveBlockSize,
        haveBlock: false,
        sendDontHave: false
      }
    }

    /**
     * @param {Task[]} tasks
     * @param {number} expSize
     * @param {number} expBlockSize
     * @param {boolean} expIsWantBlock
     */
    const runTestCase = (tasks, expSize, expBlockSize, expIsWantBlock) => {
      tasks = cloneTasks(tasks)

      const rq = new RequestQueue(TaskMerger)
      rq.pushTasks(peerId, tasks)

      const popped = rq.popTasks(100).tasks
      expect(popped.length).to.eql(1)
      expect(popped[0].size).to.eql(expSize)
      expect(popped[0].data.blockSize).to.eql(expBlockSize)
      expect(popped[0].data.isWantBlock).to.eql(expIsWantBlock)
    }

    const isWantBlock = true
    const isWantHave = false

    // want-block (DONT_HAVE) should have no effect on existing want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantBlockDontHave], wantBlockDontHave.size, wantBlockDontHaveBlockSize, isWantBlock)
    // want-have (DONT_HAVE) should have no effect on existing want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantHaveDontHave], wantBlockDontHave.size, wantBlockDontHaveBlockSize, isWantBlock)
    // want-block with size should update existing want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantBlock], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-have with size should update existing want-block (DONT_HAVE) size,
    // but leave it as a want-block (ie should not change it to want-have)
    runTestCase([wantBlockDontHave, wantHave], wantHaveBlockSize, wantHaveBlockSize, isWantBlock)

    // want-block (DONT_HAVE) size should not update existing want-block with size
    runTestCase([wantBlock, wantBlockDontHave], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-have (DONT_HAVE) should have no effect on existing want-block with size
    runTestCase([wantBlock, wantHaveDontHave], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-block with size should have no effect on existing want-block with size
    runTestCase([wantBlock, wantBlock], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-have with size should have no effect on existing want-block with size
    runTestCase([wantBlock, wantHave], wantBlock.size, wantBlockBlockSize, isWantBlock)

    // want-block (DONT_HAVE) should update type and entry size of existing want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantBlockDontHave], wantBlockDontHave.size, wantBlockDontHaveBlockSize, isWantBlock)
    // want-have (DONT_HAVE) should have no effect on existing want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantHaveDontHave], wantHaveDontHave.size, wantHaveDontHaveBlockSize, isWantHave)
    // want-block with size should update existing want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantBlock], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-have with size should update existing want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantHave], wantHave.size, wantHaveBlockSize, isWantHave)

    // want-block (DONT_HAVE) should update type and entry size of existing want-have with size
    runTestCase([wantHave, wantBlockDontHave], wantHaveBlockSize, wantHaveBlockSize, isWantBlock)
    // want-have (DONT_HAVE) should not update existing want-have with size
    runTestCase([wantHave, wantHaveDontHave], wantHave.size, wantHaveBlockSize, isWantHave)
    // want-block with size should update type and entry size of existing want-have with size
    runTestCase([wantHave, wantBlock], wantBlock.size, wantBlockBlockSize, isWantBlock)
    // want-have should have no effect on existing want-have
    runTestCase([wantHave, wantHave], wantHave.size, wantHaveBlockSize, isWantHave)
  })

  it('push have vs block active', () => {
    const wantBlock = {
      topic: '1',
      priority: 10,
      size: 10,
      data: {
        isWantBlock: true,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }

    /**
     * @param {Task[]} tasks
     * @param {number} expCount
     */
    const runTestCase = (tasks, expCount) => {
      tasks = cloneTasks(tasks)

      const rq = new RequestQueue(TaskMerger)

      const popped = []
      for (const task of tasks) {
        // Push the task
        rq.pushTasks(peerId, [task])
        // Pop the task (which makes it active)
        const res = rq.popTasks(10)
        popped.push(...res.tasks)
      }
      expect(popped.length).to.eql(expCount)
    }

    // should ignore second want-have
    runTestCase([wantHave, wantHave], 1)
    // should ignore second want-block
    runTestCase([wantBlock, wantBlock], 1)
    // want-have does not overwrite want-block
    runTestCase([wantBlock, wantHave], 1)
    // can't replace want-have with want-block because want-have is active
    runTestCase([wantHave, wantBlock], 2)
  })

  it('push size info active', () => {
    const wantBlock = {
      topic: '1',
      priority: 10,
      size: 10,
      data: {
        isWantBlock: true,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantBlockDontHave = {
      topic: '1',
      priority: 10,
      size: 2,
      data: {
        isWantBlock: true,
        blockSize: 0,
        haveBlock: false,
        sendDontHave: false
      }
    }
    const wantHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: 10,
        haveBlock: true,
        sendDontHave: false
      }
    }
    const wantHaveDontHave = {
      topic: '1',
      priority: 10,
      size: 1,
      data: {
        isWantBlock: false,
        blockSize: 0,
        haveBlock: false,
        sendDontHave: false
      }
    }

    /**
     * @param {Task[]} tasks
     * @param {Task[]} expTasks
     */
    const runTestCase = (tasks, expTasks) => {
      tasks = cloneTasks(tasks)

      const rq = new RequestQueue(TaskMerger)

      const popped = []
      for (const task of tasks) {
        // Push the task
        rq.pushTasks(peerId, [task])
        // Pop the task (which makes it active)
        const res = rq.popTasks(10)
        popped.push(...res.tasks)
      }

      expect(popped.length).to.eql(expTasks.length)
      for (let i = 0; i < popped.length; i++) {
        const task = popped[i]
        const exp = expTasks[i]
        expect(task.size).to.eql(exp.size)
        expect(task.data.isWantBlock).to.eql(exp.data.isWantBlock)
      }
    }

    // second want-block (DONT_HAVE) should be ignored
    runTestCase([wantBlockDontHave, wantBlockDontHave], [wantBlockDontHave])
    // want-have (DONT_HAVE) should be ignored if there is existing active want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantHaveDontHave], [wantBlockDontHave])
    // want-block with size should be added if there is existing active want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantBlock], [wantBlockDontHave, wantBlock])
    // want-have with size should be added if there is existing active want-block (DONT_HAVE)
    runTestCase([wantBlockDontHave, wantHave], [wantBlockDontHave, wantHave])

    // want-block (DONT_HAVE) should be added if there is existing active want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantBlockDontHave], [wantHaveDontHave, wantBlockDontHave])
    // want-have (DONT_HAVE) should be ignored if there is existing active want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantHaveDontHave], [wantHaveDontHave])
    // want-block with size should be added if there is existing active want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantBlock], [wantHaveDontHave, wantBlock])
    // want-have with size should be added if there is existing active want-have (DONT_HAVE)
    runTestCase([wantHaveDontHave, wantHave], [wantHaveDontHave, wantHave])

    // want-block (DONT_HAVE) should be ignored if there is existing active want-block with size
    runTestCase([wantBlock, wantBlockDontHave], [wantBlock])
    // want-have (DONT_HAVE) should be ignored if there is existing active want-block with size
    runTestCase([wantBlock, wantHaveDontHave], [wantBlock])
    // second want-block with size should be ignored
    runTestCase([wantBlock, wantBlock], [wantBlock])
    // want-have with size should be ignored if there is existing active want-block with size
    runTestCase([wantBlock, wantHave], [wantBlock])

    // want-block (DONT_HAVE) should be added if there is existing active want-have with size
    runTestCase([wantHave, wantBlockDontHave], [wantHave, wantBlockDontHave])
    // want-have (DONT_HAVE) should be ignored if there is existing active want-have with size
    runTestCase([wantHave, wantHaveDontHave], [wantHave])
    // second want-have with size should be ignored
    runTestCase([wantHave, wantHave], [wantHave])
    // want-block with size should be added if there is existing active want-have with size
    runTestCase([wantHave, wantBlock], [wantHave, wantBlock])
  })
})

/**
 * @param {Task[]} tasks
 */
function cloneTasks (tasks) {
  const clone = []
  for (const t of tasks) {
    clone.push({ ...t, ...{ data: { ...t.data } } })
  }
  return clone
}
