'use strict'

const TaskMerger = {
  /**
   * Indicates whether the given task has newer information than the active
   * tasks with the same topic
   *
   * @param {Task} task
   * @param {Task[]} tasksWithTopic
   * @returns {boolean}
   */
  hasNewInfo (task, tasksWithTopic) {
    let haveBlock = false
    let isWantBlock = false
    for (const existing of tasksWithTopic) {
      if (existing.data.haveBlock) {
        haveBlock = true
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

    // If we didn't have the block, and the new task indicates that we now
    // do have the block, then we must also have size information for the
    // block, so the new task has new information.
    if (!haveBlock && task.data.haveBlock) {
      return true
    }

    return false
  },

  /**
   * Merge the information from the task into the existing pending task
   *
   * @param {Task} newTask
   * @param {Task} existingTask
   */
  merge (newTask, existingTask) {
    // Tasks look like this:
    // {
    //   topic: "some topic",
    //   priority: 5,
    //
    //   # The size of the response on the wire. This is used to calculate
    //   # how many tasks to pop off the request queue and add to a message.
    //   # If the response is
    //   # - a HAVE or DONT_HAVE
    //   #   it is the size of the CID + type (HAVE/DONT_HAVE)
    //   # - a block
    //   #   it is the size of the block
    //   size: 32,
    //
    //   data: {
    //
    //     # The size of the block, if known (if we don't have the block this is zero)
    //     blockSize: 128 * 1024,
    //
    //     # Indicates if the request is for a block or for a HAVE
    //     isWantBlock: false,
    //
    //     # Do we have the block?
    //     # Note: a block can have size zero.
    //     haveBlock: true,
    //
    //     # Indicates whether to send a DONT_HAVE response if we don't have
    //     # the block.
    //     # If this is false and we don't have the block, we just ignore the
    //     # want-block request (useful for discovery where we query lots of
    //     # peers but don't want a response unless the peer has the block).
    //     sendDontHave: false
    //   }
    // }
    //
    // The merge function ignores the topic and priority as these don't change.
    //
    // We may receive new information about a want before the want has been
    // popped from the queue in the following scenarios:
    //
    // - Replace want type:
    //   1. Client sends want-have CID1
    //   2. Client sends want-block CID1
    //   In this case we should replace want-have with want-block, including
    //   updating the task size to be the block size.
    //
    // - Replace DONT_HAVE with want:
    //   1. Client sends want-have CID1 or want-block CID1
    //   2. Local node doesn't have block for CID1
    //   3. Local node receives block for CID1 from peer
    //   In this case we should replace DONT_HAVE with the want, including
    //   updating the task size and block size.
    //

    const taskData = newTask.data
    const existingData = existingTask.data

    // If we didn't have block size information (because we didn't have the
    // block) and we receive the block from a peer, update the task with the
    // new block size
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
