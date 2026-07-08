<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/stores/tasks'

const props = defineProps<{
  task: Task
  groupSlug?: string
  projectSlug?: string
  draggable?: boolean
  collapsible?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{
  toggle: [task: Task]
  click: [task: Task]
  dragstart: [event: DragEvent, task: Task]
  dragover: [event: DragEvent, task: Task]
  drop: [event: DragEvent, task: Task]
  dragend: [event: DragEvent]
  toggleCollapse: []
}>()

const isDone = computed(() => props.task.status === 'completed')

const priorityColor = computed(() => {
  switch (props.task.priority) {
    case 'urgent': return 'text-destructive'
    case 'important': return 'text-warning'
    case 'normal': return 'text-info'
    default: return 'text-transparent'
  }
})

const dueLabel = computed(() => {
  if (!props.task.due_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(props.task.due_date); due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  if (days === -1) return '昨日'
  if (days < 0) return `${-days}日前`
  return `${days}日後`
})

const dueClass = computed(() => {
  if (!props.task.due_date) return 'text-muted-foreground'
  if (isDone.value) return 'text-muted-foreground line-through'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(props.task.due_date); due.setHours(0, 0, 0, 0)
  if (due < today) return 'text-destructive font-semibold'
  if (due.getTime() === today.getTime()) return 'text-warning font-semibold'
  return 'text-muted-foreground'
})

const assigneeIds = computed<string[]>(() => {
  const t = props.task
  if (Array.isArray(t.assignee_ids)) return t.assignee_ids as string[]
  if (typeof t.assignee_ids === 'string') {
    try { return JSON.parse(t.assignee_ids) } catch { return [] }
  }
  return t.assignee_id ? [t.assignee_id] : []
})

const labels = computed<string[]>(() => {
  const t = props.task
  if (Array.isArray(t.labels)) return t.labels as string[]
  if (typeof t.labels === 'string') {
    try { return JSON.parse(t.labels) } catch { return [] }
  }
  return []
})

function userInitial(name?: string | null) {
  return name?.charAt(0) ?? '?'
}

function toggle() {
  // 完了 ⇄ 未完了
  emit('toggle', { ...props.task, status: isDone.value ? 'not_started' : 'completed' } as Task)
}
</script>

<template>
  <div
    class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 rounded-md cursor-pointer group"
    :draggable="draggable ? 'true' : undefined"
    @click="emit('click', task)"
    @dragstart="emit('dragstart', $event, task)"
    @dragover.prevent="emit('dragover', $event, task)"
    @drop.prevent="emit('drop', $event, task)"
    @dragend="emit('dragend', $event)"
  >
    <!-- ドラッグハンドル -->
    <span
      v-if="draggable"
      class="text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab text-xs select-none"
      title="ドラッグして並び替え"
    >⋮⋮</span>

    <!-- 折りたたみトグル（子タスクがあるとき） -->
    <button
      v-if="collapsible"
      class="text-muted-foreground/60 hover:text-foreground text-xs w-3 select-none shrink-0"
      :title="collapsed ? '子タスクを表示' : '子タスクを折りたたむ'"
      @click.stop="emit('toggleCollapse')"
    >{{ collapsed ? '▸' : '▾' }}</button>

    <!-- チェックボックス（2状態） -->
    <button
      class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
      :class="isDone ? 'border-success bg-success' : 'border-input hover:border-info'"
      :title="isDone ? '完了に戻す' : '完了にする'"
      @click.stop="toggle"
    >
      <svg v-if="isDone" class="w-3 h-3 text-success-foreground" viewBox="0 0 12 12" fill="none">
        <path d="M2 6 L5 9 L10 3" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>

    <!-- 優先度ドット -->
    <span class="shrink-0 text-base" :class="priorityColor">●</span>

    <div class="flex-1 min-w-0">
      <p class="text-sm" :class="{ 'line-through text-muted-foreground': isDone }">
        <span v-if="task.task_number" class="text-muted-foreground text-xs mr-2">
          {{ projectSlug ? '#' + task.task_number : 'T-' + task.task_number }}
        </span>
        {{ task.title }}
      </p>
      <!-- ラベル -->
      <div v-if="labels.length > 0" class="flex flex-wrap gap-1 mt-0.5">
        <span
          v-for="label in labels"
          :key="label"
          class="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info"
        >{{ label }}</span>
      </div>
    </div>

    <span v-if="dueLabel" class="text-xs shrink-0" :class="dueClass">{{ dueLabel }}</span>

    <div v-if="assigneeIds.length > 0" class="flex items-center -space-x-1.5 shrink-0">
      <span
        v-if="task.assignee_name"
        class="w-6 h-6 rounded-full bg-info/15 text-info text-xs flex items-center justify-center font-medium border-2 border-background"
        :title="task.assignee_name"
      >{{ userInitial(task.assignee_name) }}</span>
      <span
        v-if="assigneeIds.length > 1"
        class="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium border-2 border-background"
      >+{{ assigneeIds.length - 1 }}</span>
    </div>
  </div>
</template>
