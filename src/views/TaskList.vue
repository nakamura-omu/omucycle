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
// グループのタスク一覧は既定でプロジェクトごとに分類（各プロジェクト内をやること/完了に細分）
const groupBy = ref<'status' | 'project' | 'cycle' | 'assignee' | 'none'>('project')
const showCompleted = ref(false)
const showOptions = ref(false)

const collapsed = ref<Record<string, boolean>>({})

// === 表示設定の永続化（グループ単位。cycle.groupview.<groupId>） ===
function viewKey() {
  const gid = groupsStore.currentGroup?.id
  return gid ? `cycle.groupview.${gid}` : null
}
function restoreView() {
  const key = viewKey()
  if (!key) return
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const v = JSON.parse(raw)
    if (v.groupBy) groupBy.value = v.groupBy
    if (typeof v.showCompleted === 'boolean') showCompleted.value = v.showCompleted
    if (v.ownerFilter) ownerFilter.value = v.ownerFilter
    if (v.projectFilter) projectFilter.value = v.projectFilter
  } catch { /* 破損時は既定のまま */ }
}
function saveView() {
  const key = viewKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify({
    groupBy: groupBy.value,
    showCompleted: showCompleted.value,
    ownerFilter: ownerFilter.value,
    projectFilter: projectFilter.value,
  }))
}

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
  restoreView()
  if (!newTaskProjectId.value && projectsStore.projects.length > 0) {
    newTaskProjectId.value = projectsStore.projects[0]!.id
  }
}

onMounted(load)
watch(groupSlug, load)
watch([groupBy, showCompleted, ownerFilter, projectFilter], saveView)

const filteredTasks = computed(() => {
  // セクション（is_section=1）は行として出さない。所属は各行の section_title チップで示す
  let list = tasksStore.tasks.filter(t => !t.is_section)
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

interface Bucket { key: string; label: string; tasks: Task[]; color?: string; sub?: Bucket[] }

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
    // プロジェクトごとに分類し、各プロジェクト内をやること/完了に細分（2段）
    const map = new Map<string, Bucket>()
    for (const t of list) {
      const p = projectsStore.projects.find(x => x.id === t.project_id)
      const key = t.project_id || 'none'
      const label = p ? `${p.icon ?? '📁'} ${p.name}` : '📥 未分類'
      if (!map.has(key)) map.set(key, { key, label, tasks: [], sub: [] })
      map.get(key)!.tasks.push(t)
    }
    for (const b of map.values()) {
      const todo = b.tasks.filter(t => t.status !== 'completed')
      const done = b.tasks.filter(t => t.status === 'completed')
      const sub: Bucket[] = []
      if (todo.length > 0) sub.push({ key: `${b.key}:todo`, label: 'やること', tasks: todo, color: 'bg-info' })
      if (showCompleted.value && done.length > 0) {
        sub.push({ key: `${b.key}:done`, label: '完了', tasks: done, color: 'bg-success' })
      }
      b.sub = sub
    }
    // バケットの並びはプロジェクトの正式順（sort_order）に固定。
    // タスクの出現順に依存させない（移動でプロジェクトの並びが変わって見える問題の修正）
    const order = new Map(projectsStore.projects.map((p, i) => [p.id, i]))
    return [...map.values()].sort(
      (a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER))
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

// 実際にタスクを持つ最下層バケット（2段のときは sub、1段のときは自身）。並べ替えの探索に使う
const leafBuckets = computed<Bucket[]>(() => {
  const out: Bucket[] = []
  for (const b of buckets.value) {
    if (b.sub && b.sub.length) out.push(...b.sub)
    else out.push(b)
  }
  return out
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

// === ドラッグ並べ替え（マウス位置で上/下挿入、赤線インジケーター表示） ===
const dragTaskId = ref<string | null>(null)
const dragOverTaskId = ref<string | null>(null)
const dragOverPos = ref<'above' | 'below' | 'child' | null>(null)
function onDragStart(_e: DragEvent, task: Task) {
  dragTaskId.value = task.id
}
function onDragEnd() {
  dragTaskId.value = null
  dragOverTaskId.value = null
  dragOverPos.value = null
}
function onDragOver(e: DragEvent, task: Task) {
  e.preventDefault()
  if (!dragTaskId.value || task.id === dragTaskId.value) {
    dragOverTaskId.value = null; dragOverPos.value = null; return
  }
  const el = (e.currentTarget as HTMLElement | null)
    ?? ((e.target as HTMLElement | null)?.closest?.('[data-task-row]') as HTMLElement | null)
  if (!el) return
  const rect = el.getBoundingClientRect()
  dragOverTaskId.value = task.id
  dragOverPos.value = e.clientY - rect.top >= rect.height / 2 ? 'below' : 'above'
}
async function onDrop(_e: DragEvent, dropTarget: Task) {
  const pos = dragOverPos.value ?? 'above'
  if (!dragTaskId.value || dragTaskId.value === dropTarget.id) {
    onDragEnd()
    return
  }
  const dragId = dragTaskId.value
  onDragEnd()
  const bucket = leafBuckets.value.find(b => b.tasks.find(t => t.id === dragId))
  if (!bucket) return
  const dragTask = bucket.tasks.find(t => t.id === dragId)!

  // バケットまたぎのドロップ: グルーピング軸の属性を変更する（Todoist流）
  if (!bucket.tasks.find(t => t.id === dropTarget.id)) {
    const dstBucket = leafBuckets.value.find(b => b.tasks.find(t => t.id === dropTarget.id))
    if (!dstBucket) return
    // プロジェクト別表示: 別プロジェクトのバケットへ → プロジェクト移設
    if (groupBy.value === 'project' && dropTarget.project_id
        && dragTask.project_id !== dropTarget.project_id) {
      const pb = buckets.value.find(b => b.key === dropTarget.project_id)
      await tasksStore.moveToProject(dragId, dropTarget.project_id, pb?.label ?? '移動先プロジェクト')
      if (groupsStore.currentGroup?.id) await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
      return
    }
    // やること⇆完了（status表示、またはproject表示内のサブバケット間）
    const isDone = (b: Bucket) => b.key === 'completed' || b.key.endsWith(':done')
    if ((groupBy.value === 'status' || groupBy.value === 'project') && isDone(dstBucket) !== isDone(bucket)) {
      await tasksStore.updateStatus(dragId, isDone(dstBucket) ? 'completed' : 'not_started', userStore.currentUser?.id)
      if (groupsStore.currentGroup?.id) await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
      return
    }
    // サイクル別・担当者別のまたぎは未対応（並べ替えのみ）
    return
  }

  const snapshotOrders = bucket.tasks.map(t => ({ id: t.id, sort_order: t.sort_order ?? 0 }))
  const reordered = bucket.tasks.filter(t => t.id !== dragId)
  const dropIdx = reordered.findIndex(t => t.id === dropTarget.id)
  if (dropIdx < 0) return
  reordered.splice(dropIdx + (pos === 'below' ? 1 : 0), 0, dragTask)
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
  tasksStore.showUndoToast('タスクを移動しました', async () => {
    await api('/api/tasks/reorder-bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: snapshotOrders }),
    })
    if (groupsStore.currentGroup?.id) {
      await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
    }
  })
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
          <!-- 2段（プロジェクト内をやること/完了に細分） -->
          <template v-if="b.sub && b.sub.length">
            <div v-for="s in b.sub" :key="s.key">
              <div class="flex items-center gap-2 pl-5 py-1 text-xs text-muted-foreground">
                <span v-if="s.color" class="w-1.5 h-1.5 rounded-full" :class="s.color"></span>
                <span>{{ s.label }}</span>
                <span>{{ s.tasks.length }}</span>
              </div>
              <TaskRow
                v-for="t in s.tasks"
                :key="t.id"
                :task="t"
                :draggable="true"
                :drop-indicator="t.id === dragOverTaskId ? dragOverPos : null"
                @toggle="toggleStatus"
                @click="openTask"
                @dragstart="onDragStart"
                @dragover="onDragOver"
                @drop="onDrop"
                @dragend="onDragEnd"
              />
            </div>
          </template>
          <!-- 1段 -->
          <template v-else>
            <TaskRow
              v-for="t in b.tasks"
              :key="t.id"
              :task="t"
              :draggable="true"
              :drop-indicator="t.id === dragOverTaskId ? dragOverPos : null"
              @toggle="toggleStatus"
              @click="openTask"
              @dragstart="onDragStart"
              @dragover="onDragOver"
              @drop="onDrop"
              @dragend="onDragEnd"
            />
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
