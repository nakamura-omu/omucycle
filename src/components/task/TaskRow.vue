<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/stores/tasks'
import { useDndStore } from '@/stores/dnd'
import UserAvatar from '@/components/UserAvatar.vue'

const props = defineProps<{
  task: Task
  groupSlug?: string
  projectSlug?: string
  draggable?: boolean
  collapsible?: boolean
  collapsed?: boolean
  /** D&D中の挿入位置表示: above/below=兄弟として挿入、child=子タスク化 */
  dropIndicator?: 'above' | 'below' | 'child' | null
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

// Todoist流: 優先度はチェックサークルの色で表現（P1=赤/P2=橙/P3=青/なし=灰）
const circleClass = computed(() => {
  if (isDone.value) {
    switch (props.task.priority) {
      case 'urgent': return 'border-destructive bg-destructive'
      case 'important': return 'border-warning bg-warning'
      case 'normal': return 'border-info bg-info'
      default: return 'border-muted-foreground bg-muted-foreground'
    }
  }
  switch (props.task.priority) {
    case 'urgent': return 'border-destructive bg-destructive/10 hover:bg-destructive/20 text-destructive'
    case 'important': return 'border-warning bg-warning/10 hover:bg-warning/20 text-warning'
    case 'normal': return 'border-info bg-info/10 hover:bg-info/20 text-info'
    default: return 'border-muted-foreground/50 hover:bg-muted text-muted-foreground'
  }
})

const dueLabel = computed(() => {
  if (!props.task.due_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(props.task.due_date); due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  const day = days === 0 ? '今日'
    : days === 1 ? '明日'
    : days === -1 ? '昨日'
    : days < 0 ? `${-days}日前`
    : `${days}日後`
  // 時刻付き期限（M365カレンダー連携用）は時刻も添える
  return props.task.due_time ? `${day} ${props.task.due_time}` : day
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

function toggle() {
  // 完了 ⇄ 未完了
  emit('toggle', { ...props.task, status: isDone.value ? 'not_started' : 'completed' } as Task)
}

// サイドバーへのドロップ移動用にドラッグ中タスクをグローバル共有
const dnd = useDndStore()
function onDragStart(e: DragEvent) {
  dnd.start(props.task)
  emit('dragstart', e, props.task)
}
function onDragEnd(e: DragEvent) {
  dnd.end()
  emit('dragend', e)
}
</script>

<template>
  <div
    class="relative flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 rounded-md cursor-pointer group"
    data-task-row
    :draggable="draggable ? 'true' : undefined"
    @click="emit('click', task)"
    @dragstart="onDragStart"
    @dragover.prevent="emit('dragover', $event, task)"
    @drop.prevent="emit('drop', $event, task)"
    @dragend="onDragEnd"
  >
    <!-- ドロップ位置インジケーター（Todoist流: 赤線+丸。childは字下げ表示） -->
    <div
      v-if="dropIndicator"
      class="absolute right-0 h-0.5 bg-primary rounded pointer-events-none z-10"
      :class="[
        dropIndicator === 'above' ? 'top-0' : 'bottom-0',
        dropIndicator === 'child' ? 'left-14' : 'left-7',
      ]"
    >
      <span class="absolute -left-1.5 -top-[3px] w-2 h-2 rounded-full border-2 border-primary bg-background"></span>
    </div>
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

    <!-- チェックサークル（Todoist流: 優先度色の円。ホバーで✓が浮かぶ） -->
    <button
      class="w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all active:scale-90 group/check"
      :class="circleClass"
      :title="isDone ? '未完了に戻す' : '完了にする'"
      @click.stop="toggle"
    >
      <svg
        class="w-3 h-3 transition-opacity"
        :class="isDone ? 'text-white opacity-100' : 'opacity-0 group-hover/check:opacity-100'"
        viewBox="0 0 12 12" fill="none"
      >
        <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

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

    <!-- 所属セクション（プロジェクト内の分類。グループ横断のタスク一覧で文脈を示す） -->
    <span
      v-if="task.section_title"
      class="text-xs text-muted-foreground shrink-0 max-w-[120px] truncate"
      :title="`セクション: ${task.section_title}`"
    >▸ {{ task.section_title }}</span>

    <span
      v-if="task.recurrence_text"
      class="text-xs text-muted-foreground shrink-0"
      :title="`繰り返し: ${task.recurrence_text}`"
    >🔁</span>

    <span v-if="dueLabel" class="text-xs shrink-0" :class="dueClass">{{ dueLabel }}</span>

    <div v-if="assigneeIds.length > 0" class="flex items-center -space-x-1.5 shrink-0">
      <span v-if="task.assignee_name" :title="task.assignee_name" class="rounded-full border-2 border-background flex">
        <UserAvatar :name="task.assignee_name" :omuid="(task as any).assignee_omuid" size="sm" />
      </span>
      <span
        v-if="assigneeIds.length > 1"
        class="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium border-2 border-background"
      >+{{ assigneeIds.length - 1 }}</span>
    </div>
  </div>
</template>
