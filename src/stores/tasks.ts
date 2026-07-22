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
  due_time: string | null
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
  section_title?: string | null
  recurrence_text?: string | null
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

  async function updateTask(taskId: string, data: Partial<Task> & { updated_by?: string }, opts?: { silent?: boolean }) {
    // 期限変更はUndo対象（Todoist流「なんでもやれる代わりに必ず取り消せる」）
    const prevDue = data.due_date !== undefined
      ? (tasks.value.find(t => t.id === taskId)?.due_date
         ?? (currentTask.value?.id === taskId ? currentTask.value.due_date : undefined))
      : undefined
    const res = await api(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update task')
    const updated = await res.json()
    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index !== -1) tasks.value[index] = { ...tasks.value[index], ...updated }
    const mi = myTasks.value.findIndex(t => t.id === taskId)
    if (mi !== -1) myTasks.value[mi] = { ...myTasks.value[mi], ...updated }
    if (currentTask.value?.id === taskId) currentTask.value = { ...currentTask.value, ...updated }
    if (!opts?.silent && data.due_date !== undefined && prevDue !== data.due_date) {
      showUndoToast('期限を変更しました', () =>
        updateTask(taskId, { due_date: prevDue ?? null, updated_by: data.updated_by } as any, { silent: true }))
    }
    return updated
  }

  async function showUndoToast(message: string, onUndo: () => void | Promise<void>) {
    const { useToastStore } = await import('./toast')
    useToastStore().show({ message, actionLabel: '取り消す', onAction: onUndo })
  }

  // プロジェクト間移設（サイドバーへのドロップ等）。Undo=元プロジェクトへ再移設
  async function moveToProject(taskId: string, projectId: string, label: string, opts?: { silent?: boolean }) {
    const res = await api(`/api/tasks/${taskId}/move-to-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    })
    if (!res.ok) throw new Error('Failed to move task')
    const result = await res.json()
    if (result.moved) {
      // 移動元ビューの一覧からは消えるのが正: ローカルからも除去
      tasks.value = tasks.value.filter(t => t.id !== taskId)
      myTasks.value = myTasks.value.filter(t => t.id !== taskId)
      if (!opts?.silent && result.previous?.project_id) {
        showUndoToast(`${label}に移動しました`, () =>
          moveToProject(taskId, result.previous.project_id, '元の場所', { silent: true }))
      }
    }
    return result
  }

  async function updateStatus(taskId: string, status: TaskStatus, updatedBy?: string, opts?: { silent?: boolean }) {
    const prev = tasks.value.find(t => t.id === taskId)?.status
      ?? (currentTask.value?.id === taskId ? currentTask.value.status : undefined)
    const res = await api(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, updated_by: updatedBy }),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      // 繰り返しタスクの完了: サーバーが完了にせず期限を次回へ進める（Todoist流）
      if (data?.recurred) {
        const apply = (t: { status: TaskStatus; due_date: string | null }, due: string | null) => {
          t.status = 'not_started'; t.due_date = due
        }
        const t = tasks.value.find(x => x.id === taskId)
        if (t) apply(t, data.next_due)
        const m = myTasks.value.find(x => x.id === taskId)
        if (m) apply(m, data.next_due)
        if (currentTask.value?.id === taskId) apply(currentTask.value, data.next_due)
        if (!opts?.silent) {
          const d = new Date(data.next_due)
          const label = d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
          showUndoToast(`繰り返しタスクを完了しました。次回: ${label}`, async () => {
            await updateTask(taskId, { due_date: data.previous_due ?? null, updated_by: updatedBy } as any, { silent: true })
          })
        }
        return
      }
      const idx = tasks.value.findIndex(t => t.id === taskId)
      if (idx !== -1) tasks.value[idx]!.status = status
      if (currentTask.value?.id === taskId) currentTask.value.status = status
      // Todoist流: 変更直後に「取り消す」トースト（Undo実行時はsilentで再帰を止める）
      if (!opts?.silent && prev && prev !== status) {
        const { useToastStore } = await import('./toast')
        useToastStore().show({
          message: status === 'completed' ? '1件のタスクを完了しました'
            : prev === 'completed' ? 'タスクを未完了に戻しました' : 'ステータスを変更しました',
          actionLabel: '取り消す',
          onAction: () => updateStatus(taskId, prev, updatedBy, { silent: true }),
        })
      }
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
    moveToProject, showUndoToast,
  }
})
