<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()

// 旧形式（UUID）または新形式（slug）
const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)
const instanceId = computed(() => route.params.instanceId as string | undefined)
const instanceKey = computed(() => route.params.instanceKey as string | undefined)

// 実際のgroupIdを取得（UUIDまたはcurrentGroupから）
const resolvedGroupId = computed(() => {
  if (groupId.value) return groupId.value
  return groupsStore.currentGroup?.id || ''
})

interface Task {
  id: string
  title: string
  description: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  priority: 'urgent' | 'important' | 'normal' | 'none'
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  depth: number
  parent_task_id: string | null
}

interface JobInstance {
  id: string
  job_name: string | null
  job_description: string | null
  category: string | null
  fiscal_year: number
  actual_start: string | null
  actual_end: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  tasks: Task[]
}

const instance = ref<JobInstance | null>(null)
const isLoading = ref(true)

const statusLabels: Record<string, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
}

const priorityLabels: Record<string, string> = {
  urgent: '緊急',
  important: '重要',
  normal: '通常',
  none: 'なし',
}

const priorityColors: Record<string, string> = {
  urgent: '#dc2626',
  important: '#f59e0b',
  normal: '#6b7280',
  none: '#d1d5db',
}

async function fetchInstance() {
  isLoading.value = true
  try {
    let res: Response
    if (instanceId.value && resolvedGroupId.value) {
      // 旧形式: /api/groups/:groupId/job-instances/:instanceId
      res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${instanceId.value}`)
    } else if (instanceKey.value && groupSlug.value) {
      // 新形式: /api/browse/:slug/:instanceKey
      res = await fetch(`/api/browse/${groupSlug.value}/${instanceKey.value}`)
      if (res.ok) {
        const data = await res.json()
        // タスク一覧も取得
        const tasksRes = await fetch(`/api/browse/${groupSlug.value}/${instanceKey.value}/tasks`)
        if (tasksRes.ok) {
          const tasks = await tasksRes.json()
          instance.value = { ...data, tasks }
          isLoading.value = false
          return
        }
      }
    } else {
      isLoading.value = false
      return
    }

    if (res.ok) {
      instance.value = await res.json()
    } else {
      goBack()
    }
  } catch (error) {
    console.error('Failed to fetch instance:', error)
  } finally {
    isLoading.value = false
  }
}

function goBack() {
  if (groupSlug.value) {
    router.push(`/${groupSlug.value}/job-instances`)
  } else {
    router.push(`/groups/${resolvedGroupId.value}/job-instances`)
  }
}

function goToTaskDetail(task: Task & { task_number?: number }) {
  if (groupSlug.value && instanceKey.value && task.task_number) {
    // 新形式: /:slug/:instanceKey/tasks/:taskNumber
    router.push(`/${groupSlug.value}/${instanceKey.value}/tasks/${task.task_number}`)
  } else {
    // 旧形式
    router.push(`/groups/${resolvedGroupId.value}/tasks/${task.id}`)
  }
}

async function toggleTaskStatus(task: Task) {
  const newStatus = task.status === 'completed' ? 'not_started' : 'completed'
  try {
    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      task.status = newStatus
    }
  } catch (error) {
    console.error('Failed to update task status:', error)
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

// タスクをツリー構造に整形
const taskTree = computed(() => {
  if (!instance.value?.tasks) return []

  const tasks = instance.value.tasks
  const roots = tasks.filter(t => !t.parent_task_id)

  function buildTree(parent: Task): any {
    const children = tasks.filter(t => t.parent_task_id === parent.id)
    return {
      ...parent,
      children: children.map(buildTree)
    }
  }

  return roots.map(buildTree)
})

const progress = computed(() => {
  if (!instance.value?.tasks.length) return 0
  const completed = instance.value.tasks.filter(t => t.status === 'completed').length
  return Math.round((completed / instance.value.tasks.length) * 100)
})

onMounted(() => {
  fetchInstance()
})
</script>

<template>
  <div class="instance-detail-page">
    <div class="page-header">
      <button class="back-btn" @click="goBack">← 業務タスク一覧</button>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <template v-else-if="instance">
      <!-- 業務情報ヘッダー -->
      <div class="instance-header-card">
        <div class="instance-info">
          <span class="fiscal-year">{{ instance.fiscal_year }}年度</span>
          <h1>{{ instance.job_name || '（業務名なし）' }}</h1>
          <p v-if="instance.job_description" class="description">{{ instance.job_description }}</p>
        </div>

        <div class="instance-progress">
          <div class="progress-circle">
            <svg viewBox="0 0 36 36">
              <path
                class="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="circle-fill"
                :stroke-dasharray="`${progress}, 100`"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span class="progress-number">{{ progress }}%</span>
          </div>
          <div class="progress-label">
            {{ instance.tasks.filter(t => t.status === 'completed').length }} / {{ instance.tasks.length }} 完了
          </div>
        </div>
      </div>

      <!-- タスク一覧 -->
      <div class="tasks-section">
        <h2>タスク一覧</h2>

        <div v-if="taskTree.length === 0" class="empty-tasks">
          <p>タスクがありません</p>
        </div>

        <div v-else class="task-list">
          <template v-for="task in taskTree" :key="task.id">
            <div class="task-item depth-0" :class="{ completed: task.status === 'completed' }">
              <div class="task-main">
                <button
                  class="task-checkbox"
                  :class="{ checked: task.status === 'completed' }"
                  @click.stop="toggleTaskStatus(task)"
                >
                  <span v-if="task.status === 'completed'">✓</span>
                </button>
                <div class="task-content" @click="goToTaskDetail(task)">
                  <span class="task-title">{{ task.title }}</span>
                  <div class="task-meta">
                    <span
                      v-if="task.due_date"
                      class="task-due"
                      :class="{ overdue: isOverdue(task) }"
                    >
                      {{ formatDate(task.due_date) }}
                    </span>
                    <span v-if="task.assignee_name" class="task-assignee">
                      {{ task.assignee_name }}
                    </span>
                    <span
                      v-if="task.priority !== 'none'"
                      class="task-priority"
                      :style="{ color: priorityColors[task.priority] }"
                    >
                      {{ priorityLabels[task.priority] }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 子タスク -->
              <div v-if="task.children?.length" class="children-tasks">
                <template v-for="child in task.children" :key="child.id">
                  <div class="task-item depth-1" :class="{ completed: child.status === 'completed' }">
                    <div class="task-main">
                      <button
                        class="task-checkbox"
                        :class="{ checked: child.status === 'completed' }"
                        @click.stop="toggleTaskStatus(child)"
                      >
                        <span v-if="child.status === 'completed'">✓</span>
                      </button>
                      <div class="task-content" @click="goToTaskDetail(child)">
                        <span class="task-title">{{ child.title }}</span>
                        <div class="task-meta">
                          <span
                            v-if="child.due_date"
                            class="task-due"
                            :class="{ overdue: isOverdue(child) }"
                          >
                            {{ formatDate(child.due_date) }}
                          </span>
                          <span v-if="child.assignee_name" class="task-assignee">
                            {{ child.assignee_name }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- 孫タスク -->
                    <div v-if="child.children?.length" class="children-tasks">
                      <div
                        v-for="grandchild in child.children"
                        :key="grandchild.id"
                        class="task-item depth-2"
                        :class="{ completed: grandchild.status === 'completed' }"
                      >
                        <div class="task-main">
                          <button
                            class="task-checkbox"
                            :class="{ checked: grandchild.status === 'completed' }"
                            @click.stop="toggleTaskStatus(grandchild)"
                          >
                            <span v-if="grandchild.status === 'completed'">✓</span>
                          </button>
                          <div class="task-content" @click="goToTaskDetail(grandchild)">
                            <span class="task-title">{{ grandchild.title }}</span>
                            <div class="task-meta">
                              <span
                                v-if="grandchild.due_date"
                                class="task-due"
                                :class="{ overdue: isOverdue(grandchild) }"
                              >
                                {{ formatDate(grandchild.due_date) }}
                              </span>
                              <span v-if="grandchild.assignee_name" class="task-assignee">
                                {{ grandchild.assignee_name }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.instance-detail-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 1.5rem;
}

.back-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
}

.back-btn:hover {
  color: #1a1a2e;
}

.loading {
  text-align: center;
  color: #666;
  padding: 2rem;
}

.instance-header-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
}

.instance-info {
  flex: 1;
}

.fiscal-year {
  font-size: 0.8125rem;
  color: #666;
}

.instance-info h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0.25rem 0 0 0;
}

.description {
  color: #666;
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
}

.instance-progress {
  text-align: center;
}

.progress-circle {
  width: 80px;
  height: 80px;
  position: relative;
}

.progress-circle svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.circle-bg {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 3;
}

.circle-fill {
  fill: none;
  stroke: #22c55e;
  stroke-width: 3;
  stroke-linecap: round;
}

.progress-number {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a1a2e;
}

.progress-label {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.5rem;
}

.tasks-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tasks-section h2 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0 0 1rem 0;
}

.empty-tasks {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-item {
  border-radius: 8px;
  overflow: hidden;
}

.task-item.depth-0 {
  background: #f8f9fa;
}

.task-item.depth-1 {
  background: #fff;
  border: 1px solid #e0e0e0;
  margin-left: 1.5rem;
}

.task-item.depth-2 {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  margin-left: 1.5rem;
}

.task-item.completed {
  opacity: 0.6;
}

.task-main {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
}

.task-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.task-checkbox.checked {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.task-content {
  flex: 1;
  cursor: pointer;
}

.task-content:hover .task-title {
  color: #4cc9f0;
}

.task-title {
  font-weight: 500;
  color: #1a1a2e;
  display: block;
}

.task-item.completed .task-title {
  text-decoration: line-through;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.task-due {
  font-size: 0.75rem;
  color: #666;
}

.task-due.overdue {
  color: #dc2626;
  font-weight: 500;
}

.task-assignee {
  font-size: 0.75rem;
  color: #4338ca;
  background: #e0e7ff;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.task-priority {
  font-size: 0.75rem;
  font-weight: 500;
}

.children-tasks {
  padding-bottom: 0.5rem;
}
</style>
