<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Task, Member } from './TaskPane.vue'
import TaskComments from './TaskComments.vue'

export interface GroupStatus {
  id: string
  key: string
  label: string
  color: string
  sort_order: number
  is_done: number
}

const props = defineProps<{
  task: Task | null
  members: Member[]
  currentUserId: string
  statuses: GroupStatus[]
}>()

const emit = defineEmits<{
  close: []
  updateTask: [taskId: string, field: string, value: any]
  updateStatus: [taskId: string, status: string]
  updateProgress: [taskId: string, delta: number]
}>()

const localTask = ref<Task | null>(null)
const isSaving = ref(false)

// グループステータスから動的に生成
const statusLabels = computed(() => {
  const result: Record<string, string> = {}
  for (const s of props.statuses) {
    result[s.key] = s.label
  }
  return result
})

const statusColors = computed(() => {
  const result: Record<string, string> = {}
  for (const s of props.statuses) {
    result[s.key] = s.color
  }
  return result
})

const doneStatusKeys = computed(() =>
  props.statuses.filter(s => s.is_done).map(s => s.key)
)

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

watch(() => props.task, (newTask) => {
  localTask.value = newTask ? { ...newTask } : null
}, { immediate: true, deep: true })

async function updateField(field: string, value: any) {
  if (!localTask.value) return

  isSaving.value = true
  try {
    const res = await fetch(`/api/tasks/${localTask.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      ;(localTask.value as any)[field] = value
      emit('updateTask', localTask.value.id, field, value)
    }
  } catch (error) {
    console.error('Failed to update task:', error)
  } finally {
    isSaving.value = false
  }
}

async function updateStatus(status: string) {
  if (!localTask.value) return

  const prevStatus = localTask.value.status
  const wasDone = doneStatusKeys.value.includes(prevStatus)
  const willBeDone = doneStatusKeys.value.includes(status)

  isSaving.value = true
  try {
    const res = await fetch(`/api/tasks/${localTask.value.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      localTask.value.status = status
      emit('updateStatus', localTask.value.id, status)
      // 進捗更新
      if (willBeDone && !wasDone) {
        emit('updateProgress', localTask.value.id, 1)
      } else if (!willBeDone && wasDone) {
        emit('updateProgress', localTask.value.id, -1)
      }
    }
  } catch (error) {
    console.error('Failed to update task status:', error)
  } finally {
    isSaving.value = false
  }
}

function isAssigned(memberId: string): boolean {
  if (!localTask.value) return false
  const ids = localTask.value.assignee_ids
  if (ids && Array.isArray(ids)) {
    return ids.includes(memberId)
  }
  return localTask.value.assignee_id === memberId
}

async function toggleAssignee(memberId: string) {
  if (!localTask.value) return

  let currentIds: string[] = []
  if (localTask.value.assignee_ids && Array.isArray(localTask.value.assignee_ids)) {
    currentIds = [...localTask.value.assignee_ids]
  } else if (localTask.value.assignee_id) {
    currentIds = [localTask.value.assignee_id]
  }

  const idx = currentIds.indexOf(memberId)
  if (idx === -1) {
    currentIds.push(memberId)
  } else {
    currentIds.splice(idx, 1)
  }

  await updateField('assignee_ids', currentIds.length > 0 ? currentIds : null)
  localTask.value.assignee_ids = currentIds.length > 0 ? currentIds : null
}
</script>

<template>
  <div v-if="localTask" class="detail-panel">
    <div class="panel-header">
      <span class="task-number">#{{ localTask.task_number || '-' }}</span>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <div class="panel-body">
      <!-- 左: タスク情報 -->
      <div class="task-info">
        <!-- タイトル -->
        <div class="field-group">
          <input
            type="text"
            class="title-input"
            :value="localTask.title"
            @input="(e) => { localTask!.title = (e.target as HTMLInputElement).value }"
            @blur="updateField('title', localTask.title)"
            placeholder="タスク名"
          />
        </div>

        <!-- ステータス -->
        <div class="field-group">
          <label>ステータス</label>
          <div class="status-buttons">
            <button
              v-for="status in statuses"
              :key="status.key"
              class="status-btn"
              :class="{ active: localTask.status === status.key }"
              :style="localTask.status === status.key ? {
                background: status.color + '20',
                color: status.color,
                borderColor: status.color
              } : {}"
              @click="updateStatus(status.key)"
            >
              {{ status.label }}
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
              :class="{ active: localTask.priority === priority }"
              :style="localTask.priority === priority ? {
                background: priorityColors[priority] + '20',
                color: priorityColors[priority],
                borderColor: priorityColors[priority]
              } : {}"
              @click="updateField('priority', priority)"
            >
              {{ label }}
            </button>
          </div>
        </div>

        <!-- 日程 -->
        <div class="field-group">
          <label>日程</label>
          <div class="date-fields">
            <div class="date-field">
              <span class="date-label">開始</span>
              <input
                type="date"
                class="date-input"
                :value="localTask.start_date?.split('T')[0] || ''"
                @change="(e) => updateField('start_date', (e.target as HTMLInputElement).value || null)"
              />
            </div>
            <div class="date-field">
              <span class="date-label">期限</span>
              <input
                type="date"
                class="date-input"
                :value="localTask.due_date?.split('T')[0] || ''"
                @change="(e) => updateField('due_date', (e.target as HTMLInputElement).value || null)"
              />
            </div>
          </div>
        </div>

        <!-- 担当者 -->
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
            :value="localTask.description || ''"
            @input="(e) => { localTask!.description = (e.target as HTMLTextAreaElement).value }"
            @blur="updateField('description', localTask.description)"
            placeholder="タスクの説明を入力..."
            rows="4"
          ></textarea>
        </div>

        <div v-if="isSaving" class="saving-indicator">保存中...</div>
      </div>

      <!-- 右: コメント -->
      <TaskComments
        :task-id="localTask.id"
        :current-user-id="currentUserId"
      />
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  width: 750px;
  min-width: 750px;
  flex-shrink: 0;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #e0e0e0;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.task-number {
  font-size: 0.875rem;
  color: #666;
  font-family: monospace;
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

.panel-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.task-info {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  border-right: 1px solid #eee;
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

.date-fields {
  display: flex;
  gap: 1rem;
}

.date-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.date-label {
  font-size: 0.7rem;
  color: #999;
}

.date-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  outline: none;
}

.date-input:focus {
  border-color: #4cc9f0;
}

.assignee-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 150px;
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
  font-size: 0.75rem;
  color: #666;
  background: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-align: center;
  margin-top: 0.5rem;
}
</style>
