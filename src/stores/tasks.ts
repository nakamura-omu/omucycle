import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Task {
  id: string
  job_instance_id: string | null
  group_id: string
  task_template_id: string | null
  parent_task_id: string | null
  depth: number
  title: string
  description: string | null
  due_date: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  priority: 'urgent' | 'important' | 'normal' | 'none'
  assignee_id: string | null
  assignee_name: string | null
  created_by: string
  created_by_name: string
  group_name?: string
  children?: Task[]
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
}

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const currentTask = ref<Task | null>(null)
  const comments = ref<TaskComment[]>([])
  const isLoading = ref(false)

  const parentTasks = computed(() =>
    tasks.value.filter(t => t.parent_task_id === null)
  )

  const tasksByStatus = computed(() => ({
    not_started: tasks.value.filter(t => t.status === 'not_started'),
    in_progress: tasks.value.filter(t => t.status === 'in_progress'),
    completed: tasks.value.filter(t => t.status === 'completed'),
  }))

  async function fetchGroupTasks(groupId: string) {
    isLoading.value = true
    try {
      const res = await fetch(`/api/groups/${groupId}/tasks`)
      tasks.value = await res.json()
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTask(taskId: string) {
    isLoading.value = true
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      if (res.ok) {
        currentTask.value = await res.json()
      }
    } catch (error) {
      console.error('Failed to fetch task:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchComments(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`)
      comments.value = await res.json()
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    }
  }

  async function createTask(data: Partial<Task>) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const newTask = await res.json()
      tasks.value.push(newTask)
      return newTask
    }
    throw new Error('Failed to create task')
  }

  async function updateTask(taskId: string, data: Partial<Task>) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = { ...tasks.value[index], ...updated }
      }
      if (currentTask.value?.id === taskId) {
        currentTask.value = { ...currentTask.value, ...updated }
      }
      return updated
    }
    throw new Error('Failed to update task')
  }

  async function updateStatus(taskId: string, status: Task['status']) {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        const task = tasks.value[index]
        if (task) {
          task.status = status
        }
      }
      if (currentTask.value?.id === taskId) {
        currentTask.value.status = status
      }
    }
  }

  async function addComment(taskId: string, userId: string, content: string) {
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content }),
    })
    if (res.ok) {
      const comment = await res.json()
      comments.value.push(comment)
      return comment
    }
    throw new Error('Failed to add comment')
  }

  return {
    tasks,
    currentTask,
    comments,
    isLoading,
    parentTasks,
    tasksByStatus,
    fetchGroupTasks,
    fetchTask,
    fetchComments,
    createTask,
    updateTask,
    updateStatus,
    addComment,
  }
})
