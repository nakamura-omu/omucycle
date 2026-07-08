import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

export type TaskStatus = 'not_started' | 'in_progress' | 'completed'

export interface Task {
  id: string
  project_id: string
  cycle_id: string | null
  group_id: string
  parent_task_id: string | null
  task_number: number
  depth: number
  is_section?: number
  atlas_layout_mode?: 'free' | 'grid' | null
  atlas_columns?: number | null
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  status: TaskStatus
  priority: 'urgent' | 'important' | 'normal' | 'none'
  assignee_id: string | null
  assignee_ids: string[] | string | null
  assignee_name: string | null
  labels: string[] | string | null
  current_progress: number
  completed_at: string | null
  sort_order: number
  created_by: string
  created_by_name?: string
  group_name?: string
  group_slug?: string | null
  project_name?: string
  project_slug?: string | null
  project_prefix?: string | null
  cycle_name?: string | null
  cycle_number?: number | null
  children?: Task[]
  recurrence?: TaskRecurrence | null
  recent_progress_logs?: TaskProgressLog[]
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  user_name: string
  content: string
  is_ai_generated: boolean
  created_at: string
  reactions?: Array<{ emoji: string; count: number; user_ids: string[] }>
}

export interface TaskProgressLog {
  id: string
  task_id: string
  user_id: string
  user_name: string
  progress_percent: number | null
  note: string | null
  status_at_log: TaskStatus | null
  created_at: string
}

export interface TaskRecurrence {
  id: string
  task_id: string
  rule_text: string
  rule_kind: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  rule_json: string
  next_due: string | null
  active: number
}

export interface MyTasksFilter {
  status?: TaskStatus
  groupId?: string
  priority?: string
  hideCompleted?: boolean
}

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const myTasks = ref<Task[]>([])
  const currentTask = ref<Task | null>(null)
  const comments = ref<TaskComment[]>([])
  const progressLogs = ref<TaskProgressLog[]>([])
  const isLoading = ref(false)

  const parentTasks = computed(() => tasks.value.filter(t => t.parent_task_id === null))

  const tasksByStatus = computed(() => ({
    not_started: tasks.value.filter(t => t.status === 'not_started'),
    in_progress: tasks.value.filter(t => t.status === 'in_progress'),
    completed: tasks.value.filter(t => t.status === 'completed'),
  }))

  async function fetchGroupTasks(groupId: string) {
    isLoading.value = true
    try {
      const res = await api(`/api/groups/${groupId}/tasks`)
      tasks.value = await res.json()
    } catch (e) { console.error('fetchGroupTasks failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchProjectTasks(projectId: string, opts: { cycleId?: string; noCycle?: boolean; status?: TaskStatus } = {}) {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (opts.cycleId) params.append('cycle_id', opts.cycleId)
      if (opts.noCycle) params.append('no_cycle', 'true')
      if (opts.status) params.append('status', opts.status)
      const qs = params.toString()
      const res = await api(`/api/projects/${projectId}/tasks${qs ? '?' + qs : ''}`)
      tasks.value = await res.json()
    } catch (e) { console.error('fetchProjectTasks failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchMyTasks(userId: string, filter: MyTasksFilter = {}) {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (filter.status) params.append('status', filter.status)
      if (filter.groupId) params.append('group_id', filter.groupId)
      if (filter.priority) params.append('priority', filter.priority)
      if (filter.hideCompleted) params.append('hide_completed', 'true')
      const qs = params.toString()
      const res = await api(`/api/users/${userId}/tasks${qs ? '?' + qs : ''}`)
      myTasks.value = await res.json()
    } catch (e) { console.error('fetchMyTasks failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchTask(taskId: string) {
    isLoading.value = true
    try {
      const res = await api(`/api/tasks/${taskId}`)
      if (res.ok) currentTask.value = await res.json()
    } catch (e) { console.error('fetchTask failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchComments(taskId: string) {
    try {
      const res = await api(`/api/tasks/${taskId}/comments`)
      comments.value = await res.json()
    } catch (e) { console.error('fetchComments failed:', e) }
  }

  async function fetchProgressLogs(taskId: string) {
    try {
      const res = await api(`/api/tasks/${taskId}/progress-logs`)
      progressLogs.value = await res.json()
    } catch (e) { console.error('fetchProgressLogs failed:', e) }
  }

  async function createTask(data: Partial<Task> & { project_id: string; title: string; created_by: string }) {
    const res = await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create task')
    const newTask = await res.json()
    tasks.value.push(newTask)
    return newTask
  }

  async function updateTask(taskId: string, data: Partial<Task> & { updated_by?: string }) {
    const res = await api(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update task')
    const updated = await res.json()
    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index !== -1) tasks.value[index] = { ...tasks.value[index], ...updated }
    if (currentTask.value?.id === taskId) currentTask.value = { ...currentTask.value, ...updated }
    return updated
  }

  async function updateStatus(taskId: string, status: TaskStatus, updatedBy?: string) {
    const res = await api(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, updated_by: updatedBy }),
    })
    if (res.ok) {
      const idx = tasks.value.findIndex(t => t.id === taskId)
      if (idx !== -1) tasks.value[idx]!.status = status
      if (currentTask.value?.id === taskId) currentTask.value.status = status
    }
  }

  async function addProgressLog(taskId: string, userId: string, opts: { progress_percent?: number; note?: string }) {
    const res = await api(`/api/tasks/${taskId}/progress-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...opts }),
    })
    if (!res.ok) throw new Error('Failed to add progress log')
    const log = await res.json()
    progressLogs.value.unshift(log)
    if (opts.progress_percent != null && currentTask.value?.id === taskId) {
      currentTask.value.current_progress = opts.progress_percent
    }
    return log
  }

  async function addComment(taskId: string, userId: string, content: string) {
    const res = await api(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content }),
    })
    if (!res.ok) throw new Error('Failed to add comment')
    const comment = await res.json()
    comments.value.push(comment)
    return comment
  }

  return {
    tasks, myTasks, currentTask, comments, progressLogs, isLoading,
    parentTasks, tasksByStatus,
    fetchGroupTasks, fetchProjectTasks, fetchMyTasks, fetchTask,
    fetchComments, fetchProgressLogs,
    createTask, updateTask, updateStatus, addProgressLog, addComment,
  }
})
