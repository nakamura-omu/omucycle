<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const groupsStore = useGroupsStore()
const userStore = useUserStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)

// === 型定義 ===
interface Task {
  id: string
  title: string
  description: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  priority: 'urgent' | 'important' | 'normal' | 'none'
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  assignee_ids: string[] | null
  task_number: number | null
  depth: number
  parent_task_id: string | null
}

interface JobInstance {
  id: string
  job_definition_id: string | null
  job_name: string | null
  job_prefix: string | null
  instance_number: number | null
  category: string | null
  fiscal_year: number
  actual_start: string | null
  actual_end: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  task_count: number
  completed_count: number
  created_at: string
}

interface Member {
  id: string
  name: string
  email: string
}

// === 状態 ===
const instances = ref<JobInstance[]>([])
const selectedInstance = ref<JobInstance | null>(null)
const tasks = ref<Task[]>([])
const selectedTask = ref<Task | null>(null)
const members = ref<Member[]>([])
const isLoadingInstances = ref(false)
const isLoadingTasks = ref(false)
const isSaving = ref(false)

// === 定数 ===
const statusLabels: Record<string, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
}

const statusColors: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
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

// === Computed ===
const resolvedGroupId = computed(() => {
  if (groupId.value) return groupId.value
  return groupsStore.currentGroup?.id || ''
})

const resolvedGroupSlug = computed(() => {
  if (groupSlug.value) return groupSlug.value
  return groupsStore.currentGroup?.slug || null
})

// 進捗率
function getProgress(instance: JobInstance): number {
  if (instance.task_count === 0) return 0
  return Math.round((instance.completed_count / instance.task_count) * 100)
}

// インスタンスキー
function getInstanceKey(instance: JobInstance): string | null {
  if (instance.job_prefix && instance.instance_number) {
    return `${instance.job_prefix}-${instance.instance_number}`
  }
  return null
}

// 日付フォーマット
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

// 期限切れ判定
function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

// === API呼び出し ===
async function fetchInstances() {
  isLoadingInstances.value = true
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances`)
    if (res.ok) {
      instances.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch job instances:', error)
  } finally {
    isLoadingInstances.value = false
  }
}

async function fetchTasks(instance: JobInstance) {
  isLoadingTasks.value = true
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${instance.id}`)
    if (res.ok) {
      const data = await res.json()
      tasks.value = data.tasks || []
    }
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
  } finally {
    isLoadingTasks.value = false
  }
}

async function fetchMembers() {
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/members`)
    if (res.ok) {
      members.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

// === アクション ===
function selectInstance(instance: JobInstance) {
  selectedInstance.value = instance
  selectedTask.value = null
  fetchTasks(instance)
}

function selectTask(task: Task) {
  selectedTask.value = { ...task }
}

function closeTaskPanel() {
  selectedTask.value = null
}

// タスクステータス変更
async function updateTaskStatus(status: string) {
  if (!selectedTask.value) return

  isSaving.value = true
  try {
    const res = await fetch(`/api/tasks/${selectedTask.value.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      selectedTask.value.status = status as Task['status']
      // タスク一覧も更新
      const idx = tasks.value.findIndex(t => t.id === selectedTask.value?.id)
      if (idx !== -1) {
        tasks.value[idx].status = status as Task['status']
      }
      // インスタンスの進捗も更新
      if (selectedInstance.value) {
        if (status === 'completed') {
          selectedInstance.value.completed_count++
        } else {
          const prev = tasks.value[idx]?.status
          if (prev === 'completed') {
            selectedInstance.value.completed_count--
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to update task status:', error)
  } finally {
    isSaving.value = false
  }
}

// タスク更新（タイトル、説明、優先度、期限、担当者）
async function updateTask(field: string, value: any) {
  if (!selectedTask.value) return

  isSaving.value = true
  try {
    const res = await fetch(`/api/tasks/${selectedTask.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      const updated = await res.json()
      // selectedTaskを更新
      Object.assign(selectedTask.value, updated)
      // タスク一覧も更新
      const idx = tasks.value.findIndex(t => t.id === selectedTask.value?.id)
      if (idx !== -1) {
        Object.assign(tasks.value[idx], updated)
      }
    }
  } catch (error) {
    console.error('Failed to update task:', error)
  } finally {
    isSaving.value = false
  }
}

// チェックボックスでステータス切り替え
async function toggleTaskStatus(task: Task, e: Event) {
  e.stopPropagation()
  const newStatus = task.status === 'completed' ? 'not_started' : 'completed'

  try {
    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      task.status = newStatus
      // 選択中のタスクも更新
      if (selectedTask.value?.id === task.id) {
        selectedTask.value.status = newStatus
      }
      // インスタンスの進捗更新
      if (selectedInstance.value) {
        if (newStatus === 'completed') {
          selectedInstance.value.completed_count++
        } else {
          selectedInstance.value.completed_count--
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle task status:', error)
  }
}

// デバウンス用
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debounceUpdate(field: string, value: any) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    updateTask(field, value)
  }, 500)
}

// 担当者チェック
function isAssigned(memberId: string): boolean {
  if (!selectedTask.value) return false
  const ids = selectedTask.value.assignee_ids
  if (ids && Array.isArray(ids)) {
    return ids.includes(memberId)
  }
  // 旧形式（単一担当者）の場合
  return selectedTask.value.assignee_id === memberId
}

// 担当者トグル
async function toggleAssignee(memberId: string) {
  if (!selectedTask.value) return

  let currentIds: string[] = []
  if (selectedTask.value.assignee_ids && Array.isArray(selectedTask.value.assignee_ids)) {
    currentIds = [...selectedTask.value.assignee_ids]
  } else if (selectedTask.value.assignee_id) {
    currentIds = [selectedTask.value.assignee_id]
  }

  const idx = currentIds.indexOf(memberId)
  if (idx === -1) {
    currentIds.push(memberId)
  } else {
    currentIds.splice(idx, 1)
  }

  await updateTask('assignee_ids', currentIds.length > 0 ? currentIds : null)
}

// 担当者名の一覧を取得
function getAssigneeNames(task: Task): string[] {
  if (task.assignee_ids && Array.isArray(task.assignee_ids)) {
    return task.assignee_ids
      .map(id => members.value.find(m => m.id === id)?.name)
      .filter((name): name is string => !!name)
  }
  if (task.assignee_name) {
    return [task.assignee_name]
  }
  return []
}

onMounted(async () => {
  await Promise.all([
    fetchInstances(),
    fetchMembers(),
  ])
})
</script>

<template>
  <div class="job-workspace">
    <!-- 左ペイン: 業務インスタンス一覧 -->
    <div class="pane instances-pane">
      <div class="pane-header">
        <h3>業務タスク</h3>
      </div>

      <div v-if="isLoadingInstances" class="loading">読み込み中...</div>

      <div v-else-if="instances.length === 0" class="empty-pane">
        <p>業務タスクがありません</p>
        <router-link
          :to="resolvedGroupSlug ? `/${resolvedGroupSlug}/job-definitions` : `/groups/${resolvedGroupId}/job-definitions`"
          class="link"
        >
          業務定義へ →
        </router-link>
      </div>

      <div v-else class="instance-list">
        <div
          v-for="instance in instances"
          :key="instance.id"
          class="instance-item"
          :class="{ selected: selectedInstance?.id === instance.id }"
          @click="selectInstance(instance)"
        >
          <div class="instance-key">{{ getInstanceKey(instance) || instance.id.slice(0, 8) }}</div>
          <div class="instance-name">{{ instance.job_name || '（名称なし）' }}</div>
          <div class="instance-info">
            <span class="fiscal-year">{{ instance.fiscal_year }}年度</span>
            <span class="progress">{{ getProgress(instance) }}%</span>
          </div>
          <div class="progress-bar-mini">
            <div class="progress-fill" :style="{ width: getProgress(instance) + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 中央ペイン: タスク一覧 -->
    <div class="pane tasks-pane">
      <div v-if="!selectedInstance" class="empty-pane centered">
        <p>← 業務を選択してください</p>
      </div>

      <template v-else>
        <div class="pane-header">
          <div class="selected-instance-info">
            <span class="instance-badge">{{ getInstanceKey(selectedInstance) }}</span>
            <h3>{{ selectedInstance.job_name }}</h3>
          </div>
        </div>

        <div v-if="isLoadingTasks" class="loading">読み込み中...</div>

        <div v-else-if="tasks.length === 0" class="empty-pane">
          <p>タスクがありません</p>
        </div>

        <div v-else class="task-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="task-item"
            :class="{
              selected: selectedTask?.id === task.id,
              completed: task.status === 'completed',
              ['depth-' + task.depth]: true
            }"
            @click="selectTask(task)"
          >
            <button
              class="task-checkbox"
              :class="{ checked: task.status === 'completed' }"
              @click="toggleTaskStatus(task, $event)"
            >
              <span v-if="task.status === 'completed'">✓</span>
            </button>
            <div class="task-content">
              <span class="task-title">{{ task.title }}</span>
              <div class="task-meta">
                <span
                  v-if="task.due_date"
                  class="task-due"
                  :class="{ overdue: isOverdue(task) }"
                >
                  {{ formatDate(task.due_date) }}
                </span>
                <span
                  v-for="name in getAssigneeNames(task)"
                  :key="name"
                  class="task-assignee"
                >
                  {{ name }}
                </span>
              </div>
            </div>
            <span
              v-if="task.priority !== 'none'"
              class="priority-dot"
              :style="{ background: priorityColors[task.priority] }"
              :title="priorityLabels[task.priority]"
            ></span>
          </div>
        </div>
      </template>
    </div>

    <!-- 右ペイン: タスク詳細パネル（スライドイン） -->
    <transition name="slide">
      <div v-if="selectedTask" class="pane detail-pane">
        <div class="pane-header">
          <span class="task-number">#{{ selectedTask.task_number || '-' }}</span>
          <button class="close-btn" @click="closeTaskPanel">×</button>
        </div>

        <div class="detail-content">
          <!-- タイトル（直接編集） -->
          <div class="field-group">
            <input
              type="text"
              class="title-input"
              :value="selectedTask.title"
              @input="(e) => { selectedTask!.title = (e.target as HTMLInputElement).value }"
              @blur="updateTask('title', selectedTask.title)"
              placeholder="タスク名"
            />
          </div>

          <!-- ステータス -->
          <div class="field-group">
            <label>ステータス</label>
            <div class="status-buttons">
              <button
                v-for="(label, status) in statusLabels"
                :key="status"
                class="status-btn"
                :class="{ active: selectedTask.status === status }"
                :style="selectedTask.status === status ? {
                  background: statusColors[status] + '20',
                  color: statusColors[status],
                  borderColor: statusColors[status]
                } : {}"
                @click="updateTaskStatus(status)"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <!-- 優先度 -->
          <div class="field-group">
            <label>優先度</label>
            <div class="priority-buttons">
              <button
                v-for="(label, priority) in priorityLabels"
                :key="priority"
                class="priority-btn"
                :class="{ active: selectedTask.priority === priority }"
                :style="selectedTask.priority === priority ? {
                  background: priorityColors[priority] + '20',
                  color: priorityColors[priority],
                  borderColor: priorityColors[priority]
                } : {}"
                @click="updateTask('priority', priority)"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <!-- 期限 -->
          <div class="field-group">
            <label>期限</label>
            <input
              type="date"
              class="date-input"
              :value="selectedTask.due_date?.split('T')[0] || ''"
              @change="(e) => updateTask('due_date', (e.target as HTMLInputElement).value || null)"
            />
          </div>

          <!-- 担当者（複数選択） -->
          <div class="field-group">
            <label>担当者</label>
            <div class="assignee-list">
              <label
                v-for="member in members"
                :key="member.id"
                class="assignee-checkbox"
                :class="{ checked: isAssigned(member.id) }"
              >
                <input
                  type="checkbox"
                  :checked="isAssigned(member.id)"
                  @change="toggleAssignee(member.id)"
                />
                <span class="assignee-name">{{ member.name }}</span>
              </label>
            </div>
            <div v-if="!members.length" class="no-members">メンバーがいません</div>
          </div>

          <!-- 説明 -->
          <div class="field-group">
            <label>説明</label>
            <textarea
              class="description-input"
              :value="selectedTask.description || ''"
              @input="(e) => { selectedTask!.description = (e.target as HTMLTextAreaElement).value }"
              @blur="updateTask('description', selectedTask.description)"
              placeholder="タスクの説明を入力..."
              rows="6"
            ></textarea>
          </div>
        </div>

        <!-- 保存中インジケーター -->
        <div v-if="isSaving" class="saving-indicator">保存中...</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.job-workspace {
  display: flex;
  gap: 1px;
  background: #e0e0e0;
  overflow: hidden;
  /* 全幅表示のため position: fixed を使用 */
  position: fixed;
  top: 56px; /* ヘッダーの高さ */
  left: 220px; /* サイドバーの幅 */
  right: 0;
  bottom: 0;
}

.pane {
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.instances-pane {
  width: 280px;
  flex-shrink: 0;
}

.tasks-pane {
  flex: 1;
  min-width: 300px;
}

.detail-pane {
  width: 380px;
  flex-shrink: 0;
  border-left: 1px solid #e0e0e0;
  position: relative;
}

.pane-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.pane-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.selected-instance-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.instance-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: #e0e7ff;
  color: #4338ca;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #666;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #1a1a2e;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-pane {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-pane.centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.link {
  color: #4cc9f0;
  text-decoration: none;
  font-size: 0.875rem;
}

.link:hover {
  text-decoration: underline;
}

/* === インスタンス一覧 === */
.instance-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.instance-item {
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 0.25rem;
  transition: background 0.15s;
}

.instance-item:hover {
  background: #f5f5f5;
}

.instance-item.selected {
  background: #e0e7ff;
}

.instance-key {
  font-size: 0.7rem;
  font-family: monospace;
  color: #666;
  margin-bottom: 0.25rem;
}

.instance-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #999;
  margin-bottom: 0.375rem;
}

.progress-bar-mini {
  height: 3px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-mini .progress-fill {
  height: 100%;
  background: #22c55e;
  border-radius: 2px;
}

/* === タスク一覧 === */
.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.task-item:hover {
  background: #f5f5f5;
}

.task-item.selected {
  background: #e0e7ff;
}

.task-item.completed {
  opacity: 0.6;
}

.task-item.completed .task-title {
  text-decoration: line-through;
}

.task-item.depth-1 {
  padding-left: 1.5rem;
}

.task-item.depth-2 {
  padding-left: 2.5rem;
}

.task-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
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
  min-width: 0;
}

.task-title {
  font-size: 0.875rem;
  color: #1a1a2e;
  display: block;
}

.task-meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.task-due {
  font-size: 0.7rem;
  color: #666;
}

.task-due.overdue {
  color: #dc2626;
  font-weight: 500;
}

.task-assignee {
  font-size: 0.7rem;
  color: #4338ca;
  background: #e0e7ff;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 6px;
}

/* === 詳細パネル === */
.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.task-number {
  font-size: 0.875rem;
  color: #666;
  font-family: monospace;
}

.field-group {
  margin-bottom: 1.25rem;
}

.field-group label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #666;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.title-input {
  width: 100%;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a1a2e;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.25rem 0;
  outline: none;
  background: transparent;
}

.title-input:focus {
  border-bottom-color: #4cc9f0;
}

.status-buttons,
.priority-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status-btn,
.priority-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.status-btn:hover,
.priority-btn:hover {
  border-color: #999;
}

.status-btn.active,
.priority-btn.active {
  border-width: 2px;
}

.date-input,
.select-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  outline: none;
}

.date-input:focus,
.select-input:focus {
  border-color: #4cc9f0;
}

.description-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  resize: vertical;
  outline: none;
  font-family: inherit;
}

.description-input:focus {
  border-color: #4cc9f0;
}

.saving-indicator {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  font-size: 0.75rem;
  color: #666;
  background: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

/* === 担当者複数選択 === */
.assignee-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 180px;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fafafa;
}

.assignee-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.assignee-checkbox:hover {
  background: #e0e7ff;
}

.assignee-checkbox.checked {
  background: #e0e7ff;
}

.assignee-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #4338ca;
}

.assignee-name {
  font-size: 0.875rem;
  color: #333;
}

.no-members {
  font-size: 0.8125rem;
  color: #999;
  padding: 0.5rem;
}

/* === スライドアニメーション === */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
