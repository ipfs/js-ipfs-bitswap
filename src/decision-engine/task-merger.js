'use strict'

const TaskMerger = {
  /**
   * Indicates whether the given task has newer information than the active
   * tasks with the same topic
   * @param {Task} task
   * @param {Task[]} tasksWithTopic
   * @returns {boolean}
   */
  hasNewInfo (task, tasksWithTopic) {
    let haveSize = false
    let isWantBlock = false
    for (const existing of tasksWithTopic) {
      if (existing.data.haveBlock) {
        haveSize = true
      }

      if (existing.data.isWantBlock) {
        isWantBlock = true
      }
    }

    // If there is no active want-block and the new task is a want-block,
    // the new task is better
    if (!isWantBlock && task.data.isWantBlock) {
      return true
    }

    // If there is no size information for the CID and the new task has
    // size information, the new task is better
    if (!haveSize && task.data.haveBlock) {
      return true
    }

    return false
  },

  /**
   * Merge the information from the task into the existing pending task
   * @param {Task} newTask
   * @param {Task} existingTask
   */
  merge (newTask, existingTask) {
    const taskData = newTask.data
    const existingData = existingTask.data

    // If we now have block size information, update the task with
    // the new block size
    if (!existingData.haveBlock && taskData.haveBlock) {
      existingData.haveBlock = taskData.haveBlock
      existingData.blockSize = taskData.blockSize
    }

    // If replacing a want-have with a want-block
    if (!existingData.isWantBlock && taskData.isWantBlock) {
      // Change the type from want-have to want-block
      existingData.isWantBlock = true
      // If the want-have was a DONT_HAVE, or the want-block has a size
      if (!existingData.haveBlock || taskData.haveBlock) {
        // Update the entry size
        existingData.haveBlock = taskData.haveBlock
        existingTask.size = newTask.size
      }
    }

    // If the task is a want-block, make sure the entry size is equal
    // to the block size (because we will send the whole block)
    if (existingData.isWantBlock && existingData.haveBlock) {
      existingTask.size = existingData.blockSize
    }
  }
}

module.exports = TaskMerger
