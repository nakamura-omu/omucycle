<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import EmptyState from '@/components/layout/EmptyState.vue'
import TaskRow from '@/components/task/TaskRow.vue'

const route = useRoute()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

const groupSlug = computed(() => route.params.groupSlug as string)

const projectFilter = ref<'all' | string>('all')
const cycleFilter = ref<'all' | 'no_cycle' | string>('all')
const ownerFilter = ref<'all' | 'me'>('all')
const groupBy = ref<'status' | 'project' | 'cycle' | 'assignee' | 'none'>('status')
const showCompleted = ref(false)
const showOptions = ref(false)

const collapsed = ref<Record<string, boolean>>({})

const newTaskTitle = ref('')
const newTaskProjectId = ref<string>('')

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!groupsStore.currentGroup?.id) return
  await Promise.all([
    groupsStore.fetchMembers(groupsStore.currentGroup.id),
    projectsStore.fetchGroupProjects(groupsStore.currentGroup.id),
    tasksStore.fetchGroupTasks(groupsStore.currentGroup.id),
  ])
  if (!newTaskProjectId.value && projectsStore.projects.length > 0) {
    newTaskProjectId.value = projectsStore.projects[0]!.id
  }
}

onMounted(load)
watch(groupSlug, load)

const filteredTasks = computed(() => {
  let list = tasksStore.tasks
  if (projectFilter.value !== 'all') list = list.filter(t => t.project_id === projectFilter.value)
  if (cycleFilter.value === 'no_cycle') list = list.filter(t => !t.cycle_id)
  else if (cycleFilter.value !== 'all') list = list.filter(t => t.cycle_id === cycleFilter.value)
  if (ownerFilter.value === 'me' && userStore.currentUser?.id) {
    const me = userStore.currentUser.id
    list = list.filter(t => {
      if (t.assignee_id === me) return true
      if (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(me)) return true
      if (typeof t.assignee_ids === 'string') {
        try { return JSON.parse(t.assignee_ids).includes(me) } catch { return false }
      }
      return false
    })
  }
  if (!showCompleted.value) list = list.filter(t => t.status !== 'completed')
  return list
})

interface Bucket { key: string; label: string; tasks: Task[]; color?: string }

const buckets = computed<Bucket[]>(() => {
  const list = filteredTasks.value
  if (groupBy.value === 'none') {
    return [{ key: 'all', label: '', tasks: list }]
  }
  if (groupBy.value === 'status') {
    const result: Bucket[] = [
      { key: 'todo', label: 'やること', tasks: list.filter(t => t.status !== 'completed'), color: 'bg-info' },
    ]
    if (showCompleted.value) {
      result.push({ key: 'completed', label: '完了', tasks: list.filter(t => t.status === 'completed'), color: 'bg-success' })
    }
    return result
  }
  if (groupBy.value === 'project') {
    const map = new Map<string, Bucket>()
    for (const t of list) {
      const p = projectsStore.projects.find(x => x.id === t.project_id)
      const key = t.project_id || 'none'
      const label = p ? `${p.icon ?? '📁'} ${p.name}` : '（不明）'
      if (!map.has(key)) map.set(key, { key, label, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    return [...map.values()]
  }
  if (groupBy.value === 'cycle') {
    const cycles = projectsStore.cycles
    return [
      { key: 'no_cycle', label: 'サイクル未割当', tasks: list.filter(t => !t.cycle_id) },
      ...cycles.map(c => ({ key: c.id, label: c.name, tasks: list.filter(t => t.cycle_id === c.id) })),
    ]
  }
  // assignee
  const map = new Map<string, Bucket>()
  for (const t of list) {
    const ids: string[] = Array.isArray(t.assignee_ids)
      ? (t.assignee_ids as string[])
      : (typeof t.assignee_ids === 'string'
          ? (() => { try { return JSON.parse(t.assignee_ids as string) as string[] } catch { return [] } })()
          : (t.assignee_id ? [t.assignee_id] : []))
    if (ids.length === 0) {
      const k = 'unassigned'
      if (!map.has(k)) map.set(k, { key: k, label: '未割当', tasks: [] })
      map.get(k)!.tasks.push(t)
    } else {
      for (const uid of ids) {
        const m = groupsStore.members.find(x => x.id === uid)
        const k = uid
        const label = m?.name || uid
        if (!map.has(k)) map.set(k, { key: k, label, tasks: [] })
        map.get(k)!.tasks.push(t)
      }
    }
  }
  return [...map.values()]
})

async function quickAdd() {
  const title = newTaskTitle.value.trim()
  if (!title || !userStore.currentUser?.id) return
  let projectId = newTaskProjectId.value
  if (!projectId && groupsStore.currentGroup?.id) {
    const res = await api(`/api/projects/groups/${groupsStore.currentGroup.id}/ensure-inbox`, { method: 'POST' })
    if (res.ok) {
      const inbox = await res.json()
      projectId = inbox.id
      newTaskProjectId.value = projectId
      await projectsStore.fetchGroupProjects(groupsStore.currentGroup.id)
    }
  }
  if (!projectId) return
  await tasksStore.createTask({
    project_id: projectId,
    title,
    created_by: userStore.currentUser.id,
  })
  newTaskTitle.value = ''
  if (groupsStore.currentGroup?.id) {
    await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
  }
}

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  await tasksStore.updateStatus(task.id, task.status, userStore.currentUser.id)
  const t = tasksStore.tasks.find(x => x.id === task.id)
  if (t) t.status = task.status
}

// === ドラッグ並べ替え ===
const dragTaskId = ref<string | null>(null)
function onDragStart(_e: DragEvent, task: Task) {
  dragTaskId.value = task.id
}
function onDragOver(e: DragEvent, _task: Task) {
  e.preventDefault()
}
async function onDrop(_e: DragEvent, dropTarget: Task) {
  if (!dragTaskId.value || dragTaskId.value === dropTarget.id) {
    dragTaskId.value = null
    return
  }
  const dragId = dragTaskId.value
  dragTaskId.value = null
  // 同じバケット内の並べ替え
  const bucket = buckets.value.find(b => b.tasks.find(t => t.id === dragId))
  if (!bucket || !bucket.tasks.find(t => t.id === dropTarget.id)) return

  const dragTask = bucket.tasks.find(t => t.id === dragId)!
  const dropIdx = bucket.tasks.findIndex(t => t.id === dropTarget.id)
  const dragIdx = bucket.tasks.findIndex(t => t.id === dragId)
  const reordered = [...bucket.tasks]
  reordered.splice(dragIdx, 1)
  reordered.splice(dropIdx, 0, dragTask)
  // sort_order を計算してバルク更新
  await api('/api/tasks/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: reordered.map((t, i) => ({ id: t.id, sort_order: i })),
    }),
  })
  if (groupsStore.currentGroup?.id) {
    await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
  }
}

function openTask(t: Task) {
  if (t.project_slug) {
    taskPanelStore.open({
      groupSlug: groupSlug.value,
      projectSlug: t.project_slug,
      taskId: t.id,
      taskNumber: t.task_number,
    })
  }
}

function toggleSection(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

const groupByLabel = computed(() => ({
  status: 'ステータス', project: 'プロジェクト', cycle: 'サイクル', assignee: '担当者', none: 'なし',
}[groupBy.value]))
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- ヘッダー -->
    <div class="flex items-center justify-between mb-1">
      <h1 class="text-2xl font-bold">📋 タスク</h1>
      <div class="relative">
        <button
          class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
          @click="showOptions = !showOptions"
        >
          表示: {{ groupByLabel }} ▾
        </button>
        <div
          v-if="showOptions"
          class="absolute top-full right-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg z-30 py-1"
          @click.stop
        >
          <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">グループ化</div>
          <button
            v-for="opt in [
              { key: 'status', label: 'ステータス' },
              { key: 'project', label: 'プロジェクト' },
              { key: 'cycle', label: 'サイクル' },
              { key: 'assignee', label: '担当者' },
              { key: 'none', label: 'グループ化しない' },
            ] as const"
            :key="opt.key"
            class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
            @click="groupBy = opt.key; showOptions = false"
          >
            <span class="w-3 text-info">{{ groupBy === opt.key ? '✓' : '' }}</span>
            {{ opt.label }}
          </button>

          <div class="border-t border-border my-1"></div>

          <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">フィルタ</div>
          <button
            class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
            @click="ownerFilter = ownerFilter === 'me' ? 'all' : 'me'"
          >
            <span class="w-3 text-info">{{ ownerFilter === 'me' ? '✓' : '' }}</span>
            自分の担当のみ
          </button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
            @click="showCompleted = !showCompleted"
          >
            <span class="w-3 text-info">{{ showCompleted ? '✓' : '' }}</span>
            完了タスクも表示
          </button>

          <div class="border-t border-border my-1"></div>

          <div class="px-3 py-1.5">
            <label class="text-xs text-muted-foreground block mb-1">プロジェクト</label>
            <select
              v-model="projectFilter"
              class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">すべて</option>
              <option v-for="p in projectsStore.projects" :key="p.id" :value="p.id">
                {{ p.icon || '📁' }} {{ p.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <p class="text-sm text-muted-foreground mb-4">
      {{ filteredTasks.length }} 件
      <span v-if="ownerFilter === 'me'" class="ml-2">・自分の担当のみ</span>
      <span v-if="!showCompleted" class="ml-2">・未完了のみ</span>
    </p>

    <!-- 外側クリックで Options 閉じる -->
    <div v-if="showOptions" class="fixed inset-0 z-20" @click="showOptions = false"></div>

    <!-- Quick add（Todoist 風: 細い + ボタン） -->
    <button
      v-if="!newTaskTitle && !$route.query.add"
      class="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-info py-2 group"
      @click="newTaskTitle = ' '"
    >
      <span class="w-5 h-5 rounded-full border border-input flex items-center justify-center group-hover:border-info">＋</span>
      <span>タスクを追加</span>
    </button>
    <div v-else class="border border-input rounded-md p-2 mb-1 bg-card">
      <input
        v-model.trim="newTaskTitle"
        ref="quickInput"
        autofocus
        class="w-full text-sm bg-transparent outline-none"
        placeholder="タスク名を入力（Enterで追加）"
        @keydown.enter="quickAdd"
        @keydown.esc="newTaskTitle = ''"
      />
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <select
          v-model="newTaskProjectId"
          class="h-7 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">📥 未分類</option>
          <option v-for="p in projectsStore.projects" :key="p.id" :value="p.id">
            {{ p.icon || '📁' }} {{ p.name }}
          </option>
        </select>
        <div class="flex-1"></div>
        <button class="text-xs text-muted-foreground hover:text-foreground px-2 py-1" @click="newTaskTitle = ''">
          キャンセル
        </button>
        <button
          class="text-xs px-3 py-1 rounded-md bg-info text-info-foreground disabled:opacity-50"
          :disabled="!newTaskTitle.trim()"
          @click="quickAdd"
        >
          追加
        </button>
      </div>
    </div>

    <EmptyState
      v-if="!tasksStore.isLoading && filteredTasks.length === 0"
      message="タスクはありません"
    />

    <!-- 縦に並ぶセクション -->
    <div class="space-y-1">
      <section v-for="b in buckets" :key="b.key" class="border-t border-border first:border-t-0">
        <button
          v-if="b.label"
          class="w-full flex items-center gap-2 py-2 text-sm font-semibold text-foreground hover:bg-muted/50 -mx-2 px-2 rounded"
          @click="toggleSection(b.key)"
        >
          <span class="text-muted-foreground text-xs w-3">{{ collapsed[b.key] ? '▸' : '▾' }}</span>
          <span v-if="b.color" class="w-2 h-2 rounded-full" :class="b.color"></span>
          <span>{{ b.label }}</span>
          <span class="text-muted-foreground text-xs font-normal">{{ b.tasks.length }}</span>
        </button>

        <div v-show="!collapsed[b.key]" class="pb-1">
          <TaskRow
            v-for="t in b.tasks"
            :key="t.id"
            :task="t"
            :draggable="true"
            @toggle="toggleStatus"
            @click="openTask"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @drop="onDrop"
          />
        </div>
      </section>
    </div>
  </div>
</template>
