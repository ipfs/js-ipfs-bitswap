export interface TaskMerger {
  /**
   * Given the existing tasks with the same topic, does the task add some new
   * information? Used to decide whether to merge the task or ignore it.
   */
  hasNewInfo: (task: Task, tasksWithTopic: Task[]) => boolean

  /**
   * Merge the information from the task into the existing pending task.
   */
  merge: (newTask: Task, existingTask: Task) => void
}

export interface Task {
  /**
   * A name for the Task (like an id but not necessarily unique)
   */
  topic: string
  /**
   * Priority for the Task (tasks are ordered by priority per peer).
   */
  priority: number
  /**
   * The size of the task, e.g. the number of bytes in a block.
   */
  size: number

  data: TaskData
}

export interface TaskData {
  /**
   * The size of the block, if known (if we don't have the block this is zero)
   */
  blockSize: number
  /**
   * Indicates if the request is for a block or for a HAVE.
   */
  isWantBlock: boolean
  /**
   * Indicates if we have the block.
   */
  haveBlock: boolean
  /**
   * Indicates whether to send a DONT_HAVE response if we don't have the block.
   * If this is `false` and we don't have the block, we just ignore the
   * want-block request (useful for discovery where we query lots of peers but
   * don't want a response unless the peer has the block).
   */
  sendDontHave: boolean
}
