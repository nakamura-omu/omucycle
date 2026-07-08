import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTaskPanelStore = defineStore('taskPanel', () => {
  const taskId = ref<string | null>(null)
  const groupSlug = ref<string | null>(null)
  const projectSlug = ref<string | null>(null)
  const taskNumber = ref<number | null>(null)

  function open(opts: { groupSlug: string; projectSlug: string; taskNumber?: number; taskId?: string }) {
    groupSlug.value = opts.groupSlug
    projectSlug.value = opts.projectSlug
    taskNumber.value = opts.taskNumber ?? null
    taskId.value = opts.taskId ?? null
  }

  function close() {
    taskId.value = null
    taskNumber.value = null
    groupSlug.value = null
    projectSlug.value = null
  }

  return { taskId, taskNumber, groupSlug, projectSlug, open, close }
})
