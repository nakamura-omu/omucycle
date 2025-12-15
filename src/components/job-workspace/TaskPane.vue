<script setup lang="ts">
import { ref } from 'vue'
import type { JobInstance } from './JobInstancePane.vue'

export interface Task {
  id: string
  title: string
  description: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  priority: 'urgent' | 'important' | 'normal' | 'none'
  start_date: string | null
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  assignee_ids: string[] | null
  task_number: number | null
  depth: number
  parent_task_id: string | null
  sort_order?: number
}

export interface Member {
  id: string
  name: string
  email: string
}

interface GroupStatus {
  id: string
  key: string
  label: string
  color: string
  sort_order: number
  is_done: number
}

const props = defineProps<{
  instance: JobInstance | null
  tasks: Task[]
  selectedTaskId: string | null
  members: Member[]
  statuses: GroupStatus[]
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectTask: [task: Task]
  toggleStatus: [task: Task]
  addTask: []
  addChildTask: [parentTask: Task]
  saveTemplate: []
  editInstance: []
  reorderTasks: [tasks: { id: string; sort_order: number; parent_task_id: string | null }[]]
}>()

// ドラッグ&ドロップの状態
const draggedTask = ref<Task | null>(null)
const dragOverTaskId = ref<string | null>(null)
const dragPosition = ref<'before' | 'after' | 'child' | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
const isDragging = ref(false)

const priorityColors: Record<string, string> = {
  urgent: '#dc2626',
  important: '#f59e0b',
  normal: '#6b7280',
  none: '#d1d5db',
}

const priorityLabels: Record<string, string> = {
  urgent: '緊急',
  important: '重要',
  normal: '通常',
  none: 'なし',
}

// 背景色に適した文字色を計算（明るい背景→黒、暗い背景→白）
function getContrastTextColor(hexColor: string): string {
  // #RGB or #RRGGBB 形式を解析
  let hex = hexColor.replace('#', '')
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  // 相対輝度を計算（YIQ方式）
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance >= 128 ? '#333333' : '#ffffff'
}

function getStatusInfo(task: Task): { label: string; color: string; textColor: string } | null {
  const status = props.statuses.find(s => s.key === task.status)
  if (!status || status.is_done) return null // 完了ステータスは表示しない（チェックマークで表現）
  return {
    label: status.label,
    color: status.color,
    textColor: getContrastTextColor(status.color)
  }
}

function getInstanceKey(instance: JobInstance): string | null {
  if (instance.job_prefix && instance.instance_number) {
    return `${instance.job_prefix}-${instance.instance_number}`
  }
  return null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

function getAssigneeNames(task: Task): string[] {
  if (task.assignee_ids && Array.isArray(task.assignee_ids)) {
    return task.assignee_ids
      .map(id => props.members.find(m => m.id === id)?.name)
      .filter((name): name is string => !!name)
  }
  if (task.assignee_name) {
    return [task.assignee_name]
  }
  return []
}

function handleToggleStatus(task: Task, e: Event) {
  e.stopPropagation()
  emit('toggleStatus', task)
}

function handleAddChild(task: Task, e: Event) {
  e.stopPropagation()
  if (task.depth >= 2) return // 最大3階層
  emit('addChildTask', task)
}

// ドラッグ&ドロップ処理
function handleDragStart(task: Task, e: DragEvent) {
  console.log('Drag start:', task.title)
  draggedTask.value = task
  isDragging.value = true
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
}

function handleDragEnd(e: DragEvent) {
  e.preventDefault()
  // ドロップ時点の状態を保存（dragleaveで消される前に）
  const dragged = draggedTask.value
  const overId = dragOverTaskId.value
  const pos = dragPosition.value

  // 状態をクリア
  draggedTask.value = null
  dragOverTaskId.value = null
  dragPosition.value = null
  isDragging.value = false

  // 保存した状態で並び替えを実行
  if (dragged && overId && pos) {
    applyReorderWithParams(dragged, overId, pos)
  }
}

function handleDragOver(task: Task, e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (!draggedTask.value || draggedTask.value.id === task.id) return

  dragOverTaskId.value = task.id

  // マウス位置で挿入位置を判定
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  const height = rect.height

  if (y < height * 0.25) {
    dragPosition.value = 'before'
  } else if (y > height * 0.75) {
    dragPosition.value = 'after'
  } else {
    // 子にできるのはdepth < 2の場合のみ
    if (task.depth < 2) {
      dragPosition.value = 'child'
    } else {
      dragPosition.value = 'after'
    }
  }
}

function handleDragLeave(e: DragEvent) {
  // 子要素への移動では消さない
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) {
    return
  }
  // task-listの外に出た場合のみクリア
  const taskList = (e.currentTarget as HTMLElement).closest('.task-list')
  if (!taskList || !taskList.contains(relatedTarget)) {
    dragOverTaskId.value = null
    dragPosition.value = null
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  console.log('Drop event:', { dragged: draggedTask.value?.title, over: dragOverTaskId.value, pos: dragPosition.value })
  // ドロップ時点の状態を保存して実行
  const dragged = draggedTask.value
  const overId = dragOverTaskId.value
  const pos = dragPosition.value

  if (dragged && overId && pos) {
    console.log('Applying reorder:', dragged.title, 'to', overId, pos)
    applyReorderWithParams(dragged, overId, pos)
  }

  // 状態をクリア
  draggedTask.value = null
  dragOverTaskId.value = null
  dragPosition.value = null
  isDragging.value = false
}

function applyReorderWithParams(
  dragged: Task,
  overId: string,
  pos: 'before' | 'after' | 'child'
) {
  const targetTask = props.tasks.find(t => t.id === overId)
  if (!targetTask) return

  // 自分自身を親にしようとしていないかチェック
  if (pos === 'child' && targetTask.id === dragged.id) return

  // ターゲットがドラッグ中タスクの子孫でないかチェック（循環参照対策付き）
  function isDescendant(taskId: string, ancestorId: string, visited = new Set<string>()): boolean {
    if (visited.has(taskId)) return false // 循環参照を検出
    visited.add(taskId)
    const task = props.tasks.find(t => t.id === taskId)
    if (!task || !task.parent_task_id) return false
    if (task.parent_task_id === ancestorId) return true
    return isDescendant(task.parent_task_id, ancestorId, visited)
  }

  if (isDescendant(targetTask.id, dragged.id, new Set())) {
    console.warn('Cannot move task to its own descendant')
    return
  }

  const reorderedTasks: { id: string; sort_order: number; parent_task_id: string | null }[] = []

  let newParentId: string | null = null
  let insertIndex = 0

  if (pos === 'child') {
    newParentId = targetTask.id
    // 子タスクの最後に追加
    const children = props.tasks.filter(t => t.parent_task_id === targetTask.id)
    insertIndex = children.length
  } else {
    newParentId = targetTask.parent_task_id
    // 同じ親の兄弟タスクを取得
    const siblings = props.tasks.filter(t => t.parent_task_id === newParentId)
    const targetIndex = siblings.findIndex(t => t.id === targetTask.id)
    insertIndex = pos === 'before' ? targetIndex : targetIndex + 1
  }

  // 自分自身を親にしない
  if (newParentId === dragged.id) {
    console.warn('Cannot set task as its own parent')
    return
  }

  // 同じ親の兄弟を並び替え
  const siblings = props.tasks
    .filter(t => t.parent_task_id === newParentId && t.id !== dragged.id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  siblings.splice(insertIndex, 0, dragged)

  siblings.forEach((task, index) => {
    reorderedTasks.push({
      id: task.id,
      sort_order: index,
      parent_task_id: newParentId,
    })
  })

  emit('reorderTasks', reorderedTasks)
}

// 長押し用（タッチデバイス対応）
function handlePointerDown(task: Task, e: PointerEvent) {
  if (e.pointerType === 'touch') {
    longPressTimer = setTimeout(() => {
      draggedTask.value = task
      isDragging.value = true
    }, 500)
  }
}

function handlePointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}
</script>

<template>
  <div class="tasks-pane">
    <div v-if="!instance" class="empty-pane centered">
      <p>← 業務を選択してください</p>
    </div>

    <template v-else>
      <div class="pane-header">
        <div class="selected-instance-info">
          <span v-if="getInstanceKey(instance)" class="instance-badge">{{ getInstanceKey(instance) }}</span>
          <h3>{{ instance.job_name || '（名称未設定）' }}</h3>
          <button
            class="edit-btn"
            @click="emit('editInstance')"
            title="業務を編集"
          >
            ✎
          </button>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-sm btn-secondary"
            @click="emit('saveTemplate')"
            title="テンプレートとして保存"
          >
            テンプレ化
          </button>
          <button class="btn btn-sm btn-primary" @click="emit('addTask')">
            + タスク
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="loading">読み込み中...</div>

      <div v-else-if="tasks.length === 0" class="empty-pane">
        <p>タスクがありません</p>
        <button class="btn btn-primary" @click="emit('addTask')">
          タスクを追加
        </button>
      </div>

      <div v-else class="task-list" @dragover.prevent @drop.prevent>
        <div
          v-for="task in tasks"
          :key="task.id"
          class="task-item"
          :class="{
            selected: selectedTaskId === task.id,
            completed: task.status === 'completed',
            ['depth-' + task.depth]: true,
            dragging: draggedTask?.id === task.id,
            'drag-over': dragOverTaskId === task.id,
            'drag-before': dragOverTaskId === task.id && dragPosition === 'before',
            'drag-after': dragOverTaskId === task.id && dragPosition === 'after',
            'drag-child': dragOverTaskId === task.id && dragPosition === 'child',
          }"
          draggable="true"
          @click="emit('selectTask', task)"
          @dragstart="handleDragStart(task, $event)"
          @dragend="handleDragEnd"
          @dragover="handleDragOver(task, $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @pointerdown="handlePointerDown(task, $event)"
          @pointerup="handlePointerUp"
        >
          <button
            class="task-checkbox"
            :class="{ checked: task.status === 'completed' }"
            @click="handleToggleStatus(task, $event)"
          >
            <span v-if="task.status === 'completed'">✓</span>
          </button>
          <div class="task-content">
            <span class="task-title">{{ task.title }}</span>
            <div class="task-meta">
              <span
                v-if="task.start_date || task.due_date"
                class="task-dates"
                :class="{ overdue: isOverdue(task) }"
              >
                {{ task.start_date ? formatDate(task.start_date) : '' }}
                {{ task.start_date && task.due_date ? '〜' : '' }}
                {{ task.due_date ? formatDate(task.due_date) : '' }}
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
          <div class="task-actions">
            <button
              v-if="task.depth < 2"
              class="add-child-btn"
              @click="handleAddChild(task, $event)"
              title="子タスクを追加"
            >
              +
            </button>
            <span
              v-if="getStatusInfo(task)"
              class="status-badge"
              :style="{ background: getStatusInfo(task)!.color, color: getStatusInfo(task)!.textColor }"
            >
              {{ getStatusInfo(task)!.label }}
            </span>
            <span
              v-if="task.priority !== 'none'"
              class="priority-dot"
              :style="{ background: priorityColors[task.priority] }"
              :title="priorityLabels[task.priority]"
            ></span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tasks-pane {
  flex: 1;
  min-width: 300px;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
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

.edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: #9ca3af;
  padding: 0.25rem;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.edit-btn:hover {
  background: #f3f4f6;
  color: #4b5563;
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
  cursor: grab;
  transition: background 0.15s, border 0.15s, opacity 0.15s;
  border: 2px solid transparent;
  user-select: none;
}

.task-item:hover {
  background: #f5f5f5;
}

.task-item:hover .add-child-btn {
  opacity: 1;
}

.task-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.task-item.drag-before {
  border-top-color: #4cc9f0;
}

.task-item.drag-after {
  border-bottom-color: #4cc9f0;
}

.task-item.drag-child {
  background: #e0f7fa;
  border-color: #4cc9f0;
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

.task-dates {
  font-size: 0.7rem;
  color: #666;
}

.task-dates.overdue {
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

.task-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.add-child-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: white;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.875rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.add-child-btn:hover {
  background: #4cc9f0;
  border-color: #4cc9f0;
  color: white;
}

.status-badge {
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-primary:hover {
  background: #3ab8df;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}
</style>
