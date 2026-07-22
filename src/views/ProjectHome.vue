<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import TaskTreeRow, { type TaskTreeNode } from '@/components/task/TaskTreeRow.vue'
import TaskRow from '@/components/task/TaskRow.vue'
import EmptyState from '@/components/layout/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)

const cycleFilter = ref<'all' | 'no_cycle' | string>('all')
const showCompleted = ref(false)
const showOptions = ref(false)
const collapsed = ref<Record<string, boolean>>({})
const newTaskTitle = ref('')

// === 表示オプション（Todoist流「表示」メニュー。プロジェクトごとにlocalStorage記憶） ===
const showViewMenu = ref(false)
const layout = ref<'list' | 'board'>('list')
const sortBy = ref<'manual' | 'due' | 'priority'>('manual')
const groupMode = ref<'section' | 'status' | 'priority'>('section')

watch(() => projectsStore.currentProject?.id, (pid) => {
  if (!pid) return
  try {
    const v = JSON.parse(localStorage.getItem(`cycle.view.${pid}`) ?? 'null')
    layout.value = v?.layout ?? 'list'
    sortBy.value = v?.sortBy ?? 'manual'
    groupMode.value = v?.groupMode ?? 'section'
    showCompleted.value = v?.showCompleted ?? false
  } catch {}
}, { immediate: true })
watch([layout, sortBy, groupMode, showCompleted], () => {
  const pid = projectsStore.currentProject?.id
  if (pid) localStorage.setItem(`cycle.view.${pid}`, JSON.stringify({
    layout: layout.value, sortBy: sortBy.value,
    groupMode: groupMode.value, showCompleted: showCompleted.value,
  }))
})

// 並び替え比較（手動=sort_order / 期限=null最後 / 優先度）
const PRIORITY_RANK: Record<string, number> = { urgent: 0, important: 1, normal: 2, none: 3 }
function taskCmp(a: Task, b: Task): number {
  if (sortBy.value === 'due') {
    const ad = a.due_date ?? '9999-12-31', bd = b.due_date ?? '9999-12-31'
    if (ad !== bd) return ad < bd ? -1 : 1
  } else if (sortBy.value === 'priority') {
    const d = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
    if (d !== 0) return d
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
}

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (groupsStore.currentGroup?.id) {
    await groupsStore.fetchMembers(groupsStore.currentGroup.id)
  }
  const project = await projectsStore.fetchProjectBySlug(groupSlug.value, projectSlug.value)
  if (project) {
    await Promise.all([
      tasksStore.fetchProjectTasks(project.id),
      projectsStore.fetchCycles(project.id),
    ])
  }
}

onMounted(load)
watch([groupSlug, projectSlug], load)

// サイクルフィルタのみ適用（完了フィルタはバケットで分ける）
const cyclefilteredTasks = computed(() => {
  let list = tasksStore.tasks
  if (cycleFilter.value === 'no_cycle') list = list.filter(t => !t.cycle_id)
  else if (cycleFilter.value !== 'all') list = list.filter(t => t.cycle_id === cycleFilter.value)
  return list
})

interface SectionGroup { task: Task; children: TaskTreeNode[] }

// task の子孫（非セクションのみ）を再帰的にツリー化（表示中の並び替え設定を適用）
function buildSubtree(parentId: string | null, all: Task[]): TaskTreeNode[] {
  return all
    .filter(t => (t.parent_task_id || null) === parentId && !t.is_section)
    .sort(taskCmp)
    .map(t => ({ task: t, children: buildSubtree(t.id, all) }))
}

function filterTree(nodes: TaskTreeNode[], predicate: (t: Task) => boolean): TaskTreeNode[] {
  const result: TaskTreeNode[] = []
  for (const n of nodes) {
    const filteredChildren = filterTree(n.children, predicate)
    if (predicate(n.task) || filteredChildren.length > 0) {
      result.push({ task: n.task, children: filteredChildren })
    }
  }
  return result
}

function countNodes(nodes: TaskTreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0)
}

// やること（未完了のタスクとセクション）— 常にフラットにトップレベル表示
const todoLooseTrees = computed<TaskTreeNode[]>(() => {
  const incomplete = (t: Task) => t.status !== 'completed'
  return filterTree(buildSubtree(null, cyclefilteredTasks.value), incomplete)
})

const todoSections = computed<SectionGroup[]>(() => {
  const incomplete = (t: Task) => t.status !== 'completed'
  const all = cyclefilteredTasks.value
  return all
    .filter(t => Boolean(t.is_section))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(s => ({ task: s, children: filterTree(buildSubtree(s.id, all), incomplete) }))
})

// 完了 — 別バケットで畳み込み可能
const doneLooseTrees = computed<TaskTreeNode[]>(() => {
  const completed = (t: Task) => t.status === 'completed'
  return filterTree(buildSubtree(null, cyclefilteredTasks.value), completed)
})

const doneSections = computed<SectionGroup[]>(() => {
  const completed = (t: Task) => t.status === 'completed'
  const all = cyclefilteredTasks.value
  return all
    .filter(t => Boolean(t.is_section))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(s => ({ task: s, children: filterTree(buildSubtree(s.id, all), completed) }))
    .filter(s => s.children.length > 0)
})

const doneTotal = computed(() =>
  countNodes(doneLooseTrees.value) + doneSections.value.reduce((acc, s) => acc + countNodes(s.children), 0)
)

// セクション折りたたみ
const sectionCollapsed = ref<Record<string, boolean>>({})

// === セクション操作（Phase A: 名称変更・並べ替え・メニュー・インライン追加） ===
const editingSectionId = ref<string | null>(null)
const editingSectionTitle = ref('')
const sectionMenuId = ref<string | null>(null)
// セクション見出しのドラッグ並べ替え
const draggingSectionId = ref<string | null>(null)
const sectionDropId = ref<string | null>(null)
const sectionDropPos = ref<'above' | 'below' | null>(null)
// インラインのセクション追加（anchor 指定で上/下に挿入）
const addingSection = ref(false)
const newSectionTitle = ref('')
const addSectionAnchor = ref<{ sectionId: string; pos: 'above' | 'below' } | null>(null)
// インラインのセクション内タスク追加
const addingTaskSectionId = ref<string | null>(null)
const newSectionTaskTitle = ref('')

// is_section トップレベルの並び順を reorder-bulk で永続化
async function reorderSections(orderedIds: string[]) {
  await api('/api/tasks/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: orderedIds.map((id, i) => ({ id, sort_order: i })) }),
  })
  if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
}

// --- 名称変更（インライン） ---
function startRenameSection(sec: { task: Task }) {
  sectionMenuId.value = null
  editingSectionId.value = sec.task.id
  editingSectionTitle.value = sec.task.title
}
async function saveRenameSection() {
  const id = editingSectionId.value
  editingSectionId.value = null
  if (!id) return
  const title = editingSectionTitle.value.trim()
  const sec = tasksStore.tasks.find(t => t.id === id)
  if (!title || !sec || sec.title === title) return
  await tasksStore.updateTask(id, { title, updated_by: userStore.currentUser?.id } as any, { silent: true })
}

// --- セクション追加（インライン、anchor で上/下に挿入） ---
function openAddSection(anchor: { sectionId: string; pos: 'above' | 'below' } | null = null) {
  addSectionAnchor.value = anchor
  addingSection.value = true
  newSectionTitle.value = ''
  showOptions.value = false
  sectionMenuId.value = null
}
async function confirmAddSection() {
  const title = newSectionTitle.value.trim()
  if (!title || !projectsStore.currentProject || !userStore.currentUser?.id) { addingSection.value = false; return }
  const created = await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    title, is_section: true,
    created_by: userStore.currentUser.id,
  } as any)
  const ids = todoSections.value.map(s => s.task.id).filter(id => id !== created.id)
  let insertAt = ids.length
  if (addSectionAnchor.value) {
    const idx = ids.indexOf(addSectionAnchor.value.sectionId)
    if (idx >= 0) insertAt = addSectionAnchor.value.pos === 'above' ? idx : idx + 1
  }
  ids.splice(insertAt, 0, created.id)
  await reorderSections(ids)
  addingSection.value = false
  newSectionTitle.value = ''
  addSectionAnchor.value = null
}

// --- 削除（中のタスクは「やること」へ退避） ---
async function deleteSection(sec: { task: Task }) {
  sectionMenuId.value = null
  if (!confirm(`セクション「${sec.task.title}」を削除しますか？\n（中のタスクは「やること」に戻ります）`)) return
  const children = tasksStore.tasks.filter(t => (t.parent_task_id || null) === sec.task.id)
  for (const ch of children) {
    await tasksStore.updateTask(ch.id, { parent_task_id: null, updated_by: userStore.currentUser?.id } as any, { silent: true })
  }
  await api(`/api/tasks/${sec.task.id}`, { method: 'DELETE' })
  if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
}

// --- セクション見出しのドラッグ並べ替え ---
function onSectionDragStart(e: DragEvent, sec: { task: Task }) {
  draggingSectionId.value = sec.task.id
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onSectionDragEnd() {
  draggingSectionId.value = null
  sectionDropId.value = null
  sectionDropPos.value = null
}
// 見出しへの dragover/drop は「セクションをドラッグ中か／タスクをドラッグ中か」で分岐
function headerDragOver(e: DragEvent, sec: { task: Task }) {
  if (draggingSectionId.value) {
    if (draggingSectionId.value === sec.task.id) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    sectionDropId.value = sec.task.id
    sectionDropPos.value = (e.clientY - rect.top) > rect.height / 2 ? 'below' : 'above'
  } else {
    onDragOverSection(e, sec.task.id)
  }
}
async function headerDrop(e: DragEvent, sec: { task: Task }) {
  if (draggingSectionId.value) {
    const dragId = draggingSectionId.value
    const pos = sectionDropPos.value ?? 'above'
    onSectionDragEnd()
    if (dragId === sec.task.id) return
    const ids = todoSections.value.map(s => s.task.id).filter(id => id !== dragId)
    const idx = ids.indexOf(sec.task.id)
    if (idx < 0) return
    ids.splice(idx + (pos === 'below' ? 1 : 0), 0, dragId)
    await reorderSections(ids)
    tasksStore.showUndoToast('セクションを並べ替えました', async () => {
      if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
    })
  } else {
    await onDropOnSection(e, sec.task.id)
  }
}

// --- セクション内タスク追加（インライン） ---
function openAddTaskToSection(sectionId: string) {
  addingTaskSectionId.value = sectionId
  newSectionTaskTitle.value = ''
  sectionCollapsed.value[sectionId] = false
}
async function confirmAddTaskToSection() {
  const sid = addingTaskSectionId.value
  const title = newSectionTaskTitle.value.trim()
  if (!sid || !title || !projectsStore.currentProject || !userStore.currentUser?.id) { addingTaskSectionId.value = null; return }
  await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    parent_task_id: sid,
    title,
    created_by: userStore.currentUser.id,
  } as any)
  newSectionTaskTitle.value = ''
  if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
  // 連続入力できるよう開いたまま
}
function toggleSectionGroup(taskId: string) {
  sectionCollapsed.value[taskId] = !sectionCollapsed.value[taskId]
}

async function quickAddTask() {
  const title = newTaskTitle.value.trim()
  if (!title || !projectsStore.currentProject || !userStore.currentUser?.id) return
  const cycleId = (cycleFilter.value !== 'all' && cycleFilter.value !== 'no_cycle') ? cycleFilter.value : undefined
  await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    title,
    cycle_id: cycleId,
    created_by: userStore.currentUser.id,
  } as any)
  newTaskTitle.value = ''
}

function addNewSection() {
  openAddSection(null)
}

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  await tasksStore.updateStatus(task.id, task.status, userStore.currentUser.id)
  const t = tasksStore.tasks.find(x => x.id === task.id)
  if (t) t.status = task.status
}

// ドラッグ並び替え + セクション間移動（Todoist流: マウス位置で上/下挿入、
// 行の右側にドラッグすると子タスク化。挿入位置は赤線インジケーターで常時表示）
const dragTaskId = ref<string | null>(null)
const dragOverSectionId = ref<string | null>(null)
const dragOverTaskId = ref<string | null>(null)
const dragOverPos = ref<'above' | 'below' | 'child' | null>(null)

function onDragStart(_e: DragEvent, task: Task) { dragTaskId.value = task.id }

function clearDragState() {
  dragTaskId.value = null
  dragOverSectionId.value = null
  dragOverTaskId.value = null
  dragOverPos.value = null
}

function onDragEnd() { clearDragState() }

function onDragOver(e: DragEvent, task: Task) {
  e.preventDefault()
  if (!dragTaskId.value || task.id === dragTaskId.value) {
    dragOverTaskId.value = null; dragOverPos.value = null; return
  }
  const el = (e.currentTarget as HTMLElement | null)
    ?? ((e.target as HTMLElement | null)?.closest?.('[data-task-row]') as HTMLElement | null)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const below = e.clientY - rect.top >= rect.height / 2
  // 下半分かつ行の左端から140px以上右 → 子タスク化ゾーン（誤ネスト防止のため狭め）
  const nest = below && (e.clientX - rect.left) > 140 && (task.depth ?? 0) < 2 && !task.is_section
  dragOverTaskId.value = task.id
  dragOverPos.value = nest ? 'child' : below ? 'below' : 'above'
}

async function onDrop(_e: DragEvent, dropTarget: Task) {
  const pos = dragOverPos.value ?? 'above'
  if (!dragTaskId.value || dragTaskId.value === dropTarget.id) {
    clearDragState(); return
  }
  const dragId = dragTaskId.value
  clearDragState()
  const dragTask = tasksStore.tasks.find(t => t.id === dragId)
  if (!dragTask) return
  // 自分の子孫へのドロップは循環するので無視（サーバー側ガードの手前で弾く）
  for (let p: Task | undefined = dropTarget; p?.parent_task_id;) {
    if (p.parent_task_id === dragId) return
    p = tasksStore.tasks.find(t => t.id === p!.parent_task_id)
  }

  // Undo用スナップショット: 親と、移動に関わる兄弟のsort_order
  const prevParentId = dragTask.parent_task_id || null
  const snapshotOrders = tasksStore.tasks
    .filter(t => t.project_id === projectsStore.currentProject?.id && !t.is_section)
    .map(t => ({ id: t.id, sort_order: t.sort_order ?? 0, parent_task_id: t.parent_task_id ?? null }))
  const undoMove = async () => {
    await tasksStore.updateTask(dragId, {
      parent_task_id: prevParentId, updated_by: userStore.currentUser?.id,
    } as any, { silent: true })
    await api('/api/tasks/reorder-bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: snapshotOrders }),
    })
    if (projectsStore.currentProject?.id) {
      await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
    }
  }

  // 子タスク化（行の右側にドロップ）
  if (pos === 'child') {
    if ((dragTask.parent_task_id || null) !== dropTarget.id) {
      await tasksStore.updateTask(dragId, {
        parent_task_id: dropTarget.id,
        updated_by: userStore.currentUser?.id,
      } as any, { silent: true })
      if (projectsStore.currentProject?.id) {
        await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
      }
      tasksStore.showUndoToast(`「${dropTarget.title}」の子タスクにしました`, undoMove)
    }
    return
  }

  // 兄弟として上/下に挿入
  const targetParentId = dropTarget.parent_task_id || null
  const parentChanged = (dragTask.parent_task_id || null) !== targetParentId
  if (parentChanged) {
    await tasksStore.updateTask(dragId, {
      parent_task_id: targetParentId,
      updated_by: userStore.currentUser?.id,
    } as any, { silent: true })
  }

  const updatedDrag = tasksStore.tasks.find(t => t.id === dragId)
  if (!updatedDrag) return
  const siblings = tasksStore.tasks
    .filter(t => (t.parent_task_id || null) === targetParentId
              && t.project_id === projectsStore.currentProject?.id
              && !t.is_section)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const reordered = siblings.filter(t => t.id !== dragId)
  const dropIdx = reordered.findIndex(t => t.id === dropTarget.id)
  if (dropIdx < 0) return
  reordered.splice(dropIdx + (pos === 'below' ? 1 : 0), 0, updatedDrag)
  await api('/api/tasks/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: reordered.map((t, i) => ({ id: t.id, sort_order: i, parent_task_id: targetParentId })),
    }),
  })
  if (projectsStore.currentProject?.id) {
    await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
  }
  tasksStore.showUndoToast('タスクを移動しました', undoMove)
}

function onDragOverSection(e: DragEvent, sectionId: string) {
  if (!dragTaskId.value || dragTaskId.value === sectionId) return
  e.preventDefault()
  dragOverSectionId.value = sectionId
}

function onDragLeaveSection() {
  dragOverSectionId.value = null
}

async function onDropOnSection(_e: DragEvent, sectionId: string) {
  if (!dragTaskId.value) return
  const dragId = dragTaskId.value
  dragTaskId.value = null
  dragOverSectionId.value = null
  if (dragId === sectionId) return

  const dragTask = tasksStore.tasks.find(t => t.id === dragId)
  if (!dragTask) return

  if ((dragTask.parent_task_id || null) !== sectionId) {
    const prevParent = dragTask.parent_task_id || null
    const section = tasksStore.tasks.find(t => t.id === sectionId)
    await tasksStore.updateTask(dragId, {
      parent_task_id: sectionId,
      updated_by: userStore.currentUser?.id,
    } as any, { silent: true })
    if (projectsStore.currentProject?.id) {
      await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
    }
    tasksStore.showUndoToast(`「${section?.title ?? 'セクション'}」に移動しました`, async () => {
      await tasksStore.updateTask(dragId, {
        parent_task_id: prevParent, updated_by: userStore.currentUser?.id,
      } as any, { silent: true })
      if (projectsStore.currentProject?.id) {
        await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
      }
    })
  }
}

// セクションを「やること」最上部へ（loose 化、parent_task_id=null）するためのドロップ用
async function onDropOnLooseArea(_e: DragEvent) {
  if (!dragTaskId.value) return
  const dragId = dragTaskId.value
  dragTaskId.value = null
  dragOverSectionId.value = null
  const dragTask = tasksStore.tasks.find(t => t.id === dragId)
  if (!dragTask || !dragTask.parent_task_id) return
  const prevParent = dragTask.parent_task_id
  await tasksStore.updateTask(dragId, {
    parent_task_id: null,
    updated_by: userStore.currentUser?.id,
  } as any, { silent: true })
  if (projectsStore.currentProject?.id) {
    await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
  }
  tasksStore.showUndoToast('タスクを移動しました', async () => {
    await tasksStore.updateTask(dragId, {
      parent_task_id: prevParent, updated_by: userStore.currentUser?.id,
    } as any, { silent: true })
    if (projectsStore.currentProject?.id) {
      await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
    }
  })
}

function openTask(task: Task) {
  taskPanelStore.open({
    groupSlug: groupSlug.value,
    projectSlug: projectSlug.value,
    taskId: task.id,
    taskNumber: task.task_number,
  })
}

// === グループ化（ステータス/優先度）とボードレイアウト ===
interface Bucket { key: string; label: string; tasks: Task[] }

// タスクが属するセクション（最近接のセクション祖先）
function sectionOf(t: Task, all: Task[]): string | null {
  let p = t.parent_task_id
  while (p) {
    const pt = all.find(x => x.id === p)
    if (!pt) return null
    if (pt.is_section) return pt.id
    p = pt.parent_task_id
  }
  return null
}

const flatBuckets = computed<Bucket[]>(() => {
  const base = cyclefilteredTasks.value.filter(t => !t.is_section)
  const active = base.filter(t => t.status !== 'completed').sort(taskCmp)
  const done = base.filter(t => t.status === 'completed').sort(taskCmp)
  if (groupMode.value === 'status') {
    const cols: Bucket[] = [
      { key: 'not_started', label: '未着手', tasks: active.filter(t => t.status === 'not_started') },
      { key: 'in_progress', label: '進行中', tasks: active.filter(t => t.status === 'in_progress') },
    ]
    if (showCompleted.value) cols.push({ key: 'completed', label: '完了', tasks: done })
    return cols
  }
  if (groupMode.value === 'priority') {
    const pool = showCompleted.value ? [...active, ...done] : active
    return [
      { key: 'urgent', label: '緊急', tasks: pool.filter(t => t.priority === 'urgent') },
      { key: 'important', label: '重要', tasks: pool.filter(t => t.priority === 'important') },
      { key: 'normal', label: '通常', tasks: pool.filter(t => t.priority === 'normal') },
      { key: 'none', label: '優先度なし', tasks: pool.filter(t => !t.priority || t.priority === 'none') },
    ]
  }
  // section（ボード用）: やること + 各セクション
  const visible = showCompleted.value ? base : base.filter(t => t.status !== 'completed')
  const sections = cyclefilteredTasks.value
    .filter(t => Boolean(t.is_section))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return [
    { key: 'loose', label: 'やること', tasks: visible.filter(t => sectionOf(t, cyclefilteredTasks.value) === null).sort(taskCmp) },
    ...sections.map(s => ({
      key: s.id, label: s.title,
      tasks: visible.filter(t => sectionOf(t, cyclefilteredTasks.value) === s.id).sort(taskCmp),
    })),
  ]
})

// ボードの列間ドロップ = グループ化軸の属性を変更（すべてUndo可能）
import { useDndStore } from '@/stores/dnd'
const dnd = useDndStore()
const boardDropHover = ref<string | null>(null)

async function onBoardDrop(col: Bucket) {
  const task = dnd.draggedTask
  boardDropHover.value = null
  if (!task) return
  dnd.end()
  const uid = userStore.currentUser?.id
  if (groupMode.value === 'status') {
    if (task.status !== col.key) await tasksStore.updateStatus(task.id, col.key as any, uid)
  } else if (groupMode.value === 'priority') {
    if (task.priority !== col.key) {
      const prev = task.priority
      await tasksStore.updateTask(task.id, { priority: col.key, updated_by: uid } as any, { silent: true })
      tasksStore.showUndoToast(`優先度を「${col.label}」に変更しました`, () =>
        tasksStore.updateTask(task.id, { priority: prev, updated_by: uid } as any, { silent: true }))
    }
  } else {
    const target = col.key === 'loose' ? null : col.key
    if ((task.parent_task_id || null) !== target) {
      const prev = task.parent_task_id || null
      await tasksStore.updateTask(task.id, { parent_task_id: target, updated_by: uid } as any, { silent: true })
      if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
      tasksStore.showUndoToast(`「${col.label}」に移動しました`, async () => {
        await tasksStore.updateTask(task.id, { parent_task_id: prev, updated_by: uid } as any, { silent: true })
        if (projectsStore.currentProject?.id) await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
      })
    }
  }
}


const cycleLabel = computed(() => {
  if (cycleFilter.value === 'all') return 'すべて'
  if (cycleFilter.value === 'no_cycle') return 'サイクル未割当'
  const c = projectsStore.cycles.find(x => x.id === cycleFilter.value)
  return c?.name || ''
})
</script>

<template>
  <div :class="layout === 'board' ? 'max-w-none' : 'max-w-3xl mx-auto'">
    <div class="flex items-center justify-between mb-1">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <span>{{ projectsStore.currentProject?.is_personal ? '📥' : (projectsStore.currentProject?.icon || '📁') }}</span>
        <span>{{ projectsStore.currentProject?.is_personal ? 'インボックス' : (projectsStore.currentProject?.name || 'プロジェクト') }}</span>
      </h1>
      <div class="flex items-center gap-2">
        <button
          v-if="!projectsStore.currentProject?.is_personal"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="router.push(`/${groupSlug}/${projectSlug}/cycles`)"
        >🔁 サイクル</button>

        <!-- 表示メニュー（Todoist流: レイアウト/グループ化/並び替え/完了表示） -->
        <div class="relative">
          <button
            class="text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1.5 rounded flex items-center gap-1"
            @click="showViewMenu = !showViewMenu"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M4 6h9M4 12h6M4 18h4M15 6l3-3 3 3M18 3v18" />
            </svg>
            表示
          </button>
          <div
            v-if="showViewMenu"
            class="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-30 py-1"
            @click.stop
          >
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">レイアウト</div>
            <div class="flex gap-1 px-3 pb-2">
              <button
                v-for="opt in [{ key: 'list', label: '☰ リスト' }, { key: 'board', label: '▦ ボード' }]"
                :key="opt.key"
                class="flex-1 text-sm py-1.5 rounded-md border"
                :class="layout === opt.key ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted'"
                @click="layout = opt.key as any"
              >{{ opt.label }}</button>
            </div>
            <div class="border-t border-border my-1"></div>
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">グループ化</div>
            <button
              v-for="opt in [{ key: 'section', label: 'セクション' }, { key: 'status', label: 'ステータス' }, { key: 'priority', label: '優先度' }]"
              :key="opt.key"
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="groupMode = opt.key as any"
            >
              <span class="w-3 text-primary">{{ groupMode === opt.key ? '✓' : '' }}</span>
              {{ opt.label }}
            </button>
            <div class="border-t border-border my-1"></div>
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">並び替え</div>
            <button
              v-for="opt in [{ key: 'manual', label: '手動（ドラッグ順）' }, { key: 'due', label: '期限日' }, { key: 'priority', label: '優先度' }]"
              :key="opt.key"
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="sortBy = opt.key as any"
            >
              <span class="w-3 text-primary">{{ sortBy === opt.key ? '✓' : '' }}</span>
              {{ opt.label }}
            </button>
            <div class="border-t border-border my-1"></div>
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
              @click="showCompleted = !showCompleted"
            >
              <span>完了したタスクを表示</span>
              <span
                class="w-8 h-4.5 rounded-full transition-colors relative"
                :class="showCompleted ? 'bg-primary' : 'bg-input'"
              >
                <span
                  class="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-background transition-all"
                  :class="showCompleted ? 'left-4' : 'left-0.5'"
                ></span>
              </span>
            </button>
          </div>
        </div>
        <div v-if="showViewMenu" class="fixed inset-0 z-20" @click="showViewMenu = false"></div>

        <div class="relative">
          <button
            class="text-base text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1 rounded"
            @click="showOptions = !showOptions"
            title="メニュー"
          >⋯</button>
          <div
            v-if="showOptions"
            class="absolute top-full right-0 mt-1 w-60 bg-card border border-border rounded-md shadow-lg z-30 py-1"
            @click.stop
          >
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">新規</div>
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="newTaskTitle = ' '; showOptions = false"
            >
              <span class="text-base">＋</span>
              <span>タスクを追加</span>
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="addNewSection"
            >
              <span class="text-base">🗂️</span>
              <span>セクションを追加</span>
            </button>

            <div v-if="projectsStore.cycles.length > 0">
              <div class="border-t border-border my-1"></div>
              <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">サイクル</div>
              <button
                v-for="opt in [{ key: 'all', label: 'すべて' }, { key: 'no_cycle', label: '未割当' }, ...projectsStore.cycles.map(c => ({ key: c.id, label: c.name }))]"
                :key="opt.key"
                class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
                @click="cycleFilter = opt.key; showOptions = false"
              >
                <span class="w-3 text-info">{{ cycleFilter === opt.key ? '✓' : '' }}</span>
                {{ opt.label }}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>

    <p class="text-sm text-muted-foreground mb-4">
      {{ cyclefilteredTasks.length }} 件
      <span v-if="cycleFilter !== 'all'">・{{ cycleLabel }}</span>
      <span v-if="!showCompleted">・未完了のみ</span>
    </p>

    <div v-if="showOptions" class="fixed inset-0 z-20" @click="showOptions = false"></div>

    <!-- Quick add -->
    <button
      v-if="!newTaskTitle"
      class="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-info py-2 group"
      @click="newTaskTitle = ' '"
    >
      <span class="w-5 h-5 rounded-full border border-input flex items-center justify-center group-hover:border-info">＋</span>
      <span>タスクを追加</span>
    </button>
    <div v-else class="border border-input rounded-md p-2 mb-1 bg-card">
      <input
        v-model.trim="newTaskTitle"
        autofocus
        class="w-full text-sm bg-transparent outline-none"
        placeholder="タスク名を入力（Enterで追加）"
        @keydown.enter="quickAddTask"
        @keydown.esc="newTaskTitle = ''"
      />
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <div class="flex-1"></div>
        <button class="text-xs text-muted-foreground hover:text-foreground px-2 py-1" @click="newTaskTitle = ''">キャンセル</button>
        <button
          class="text-xs px-3 py-1 rounded-md bg-info text-info-foreground disabled:opacity-50"
          :disabled="!newTaskTitle.trim()"
          @click="quickAddTask"
        >追加</button>
      </div>
    </div>

    <EmptyState
      v-if="!tasksStore.isLoading && cyclefilteredTasks.length === 0"
      message="タスクはありません。「＋ タスクを追加」から書き始めましょう。"
    />

    <!-- やること（フラット / リスト×セクション表示）-->
    <div
      v-if="layout === 'list' && groupMode === 'section'"
      class="mt-2"
      @dragover.prevent
      @drop.prevent="todoLooseTrees.length === 0 ? onDropOnLooseArea($event) : undefined"
    >
      <TaskTreeRow
        v-for="n in todoLooseTrees"
        :key="n.task.id"
        :node="n"
        :group-slug="groupSlug"
        :project-slug="projectSlug"
        :draggable="true"
        :drag-over-task-id="dragOverTaskId"
        :drag-over-pos="dragOverPos"
        @toggle="toggleStatus"
        @click="openTask"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragend="onDragEnd"
      />

      <!-- セクション（やること内の子タスク） -->
      <div v-for="sec in todoSections" :key="sec.task.id" class="mt-3 group/sec">
        <!-- セクション見出し: 名称変更(ダブルクリック) / ドラッグで並べ替え / ⋯メニュー -->
        <div
          class="relative flex items-center gap-1 px-2 py-1.5 rounded text-sm font-semibold transition-colors"
          :class="[
            dragOverSectionId === sec.task.id ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted/40 hover:bg-muted/60',
            draggingSectionId === sec.task.id ? 'opacity-50' : '',
          ]"
          :draggable="editingSectionId !== sec.task.id"
          @dragstart="onSectionDragStart($event, sec)"
          @dragend="onSectionDragEnd"
          @dragover="headerDragOver($event, sec)"
          @dragleave="onDragLeaveSection"
          @drop.prevent="headerDrop($event, sec)"
        >
          <!-- セクション並べ替えドロップ線 -->
          <div
            v-if="sectionDropId === sec.task.id"
            class="absolute left-0 right-0 h-0.5 bg-primary"
            :class="sectionDropPos === 'below' ? 'bottom-0' : 'top-0'"
          ></div>

          <button
            class="text-muted-foreground text-xs w-3 shrink-0"
            @click="toggleSectionGroup(sec.task.id)"
          >{{ sectionCollapsed[sec.task.id] ? '▸' : '▾' }}</button>
          <span class="text-muted-foreground shrink-0">🗂️</span>

          <!-- 名称: 通常はダブルクリックで編集、編集中はInput -->
          <input
            v-if="editingSectionId === sec.task.id"
            v-model.trim="editingSectionTitle"
            class="flex-1 bg-background border border-input rounded px-1.5 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
            autofocus
            @keydown.enter="saveRenameSection"
            @keydown.esc="editingSectionId = null"
            @blur="saveRenameSection"
          />
          <button
            v-else
            class="flex items-center gap-2 flex-1 text-left min-w-0"
            @click="toggleSectionGroup(sec.task.id)"
            @dblclick="startRenameSection(sec)"
            title="ダブルクリックで名称変更"
          >
            <span class="truncate">{{ sec.task.title }}</span>
            <span class="text-xs text-muted-foreground font-normal">{{ sec.children.length }}</span>
          </button>

          <button
            class="text-xs text-muted-foreground hover:text-info opacity-0 group-hover/sec:opacity-100 transition-opacity px-1.5 shrink-0"
            @click="openAddTaskToSection(sec.task.id)"
            title="このセクションにタスクを追加"
          >＋</button>

          <!-- ⋯メニュー -->
          <div class="relative shrink-0">
            <button
              class="text-muted-foreground hover:text-foreground opacity-0 group-hover/sec:opacity-100 transition-opacity px-1"
              @click.stop="sectionMenuId = sectionMenuId === sec.task.id ? null : sec.task.id"
              title="メニュー"
            >⋯</button>
            <div
              v-if="sectionMenuId === sec.task.id"
              class="absolute top-full right-0 mt-1 w-44 bg-card border border-border rounded-md shadow-lg z-30 py-1 text-sm font-normal"
              @click.stop
            >
              <button class="w-full text-left px-3 py-1.5 hover:bg-muted" @click="startRenameSection(sec)">✏️ 名称変更</button>
              <button class="w-full text-left px-3 py-1.5 hover:bg-muted" @click="openAddSection({ sectionId: sec.task.id, pos: 'above' })">↑ 上にセクション追加</button>
              <button class="w-full text-left px-3 py-1.5 hover:bg-muted" @click="openAddSection({ sectionId: sec.task.id, pos: 'below' })">↓ 下にセクション追加</button>
              <div class="border-t border-border my-1"></div>
              <button class="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive" @click="deleteSection(sec)">🗑️ セクションを削除</button>
            </div>
          </div>
        </div>
        <!-- メニュー外側クリックで閉じる -->
        <div v-if="sectionMenuId === sec.task.id" class="fixed inset-0 z-20" @click="sectionMenuId = null"></div>

        <div
          v-show="!sectionCollapsed[sec.task.id]"
          class="ml-4 mt-0.5 border-l border-border pl-2"
          @dragover="onDragOverSection($event, sec.task.id)"
          @dragleave="onDragLeaveSection"
          @drop.prevent="onDropOnSection($event, sec.task.id)"
        >
          <TaskTreeRow
            v-for="n in sec.children"
            :key="n.task.id"
            :node="n"
            :group-slug="groupSlug"
            :project-slug="projectSlug"
            :draggable="true"
            :drag-over-task-id="dragOverTaskId"
            :drag-over-pos="dragOverPos"
            @toggle="toggleStatus"
            @click="openTask"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @drop="onDrop"
            @dragend="onDragEnd"
          />
          <div v-if="sec.children.length === 0" class="text-xs text-muted-foreground/70 italic py-1 px-2">
            空のセクション（タスクをここにドロップで入れられます）
          </div>

          <!-- セクション内タスクのインライン追加 -->
          <div v-if="addingTaskSectionId === sec.task.id" class="py-1 px-2">
            <input
              v-model.trim="newSectionTaskTitle"
              autofocus
              class="w-full text-sm bg-transparent outline-none border-b border-input pb-1"
              placeholder="タスク名を入力（Enterで追加、Escで閉じる）"
              @keydown.enter="confirmAddTaskToSection"
              @keydown.esc="addingTaskSectionId = null"
              @blur="addingTaskSectionId = null"
            />
          </div>
        </div>
      </div>

      <!-- セクション追加（インライン） -->
      <div class="mt-3">
        <div v-if="addingSection && !addSectionAnchor" class="px-2">
          <input
            v-model.trim="newSectionTitle"
            autofocus
            class="w-full text-sm font-semibold bg-background border border-input rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary"
            placeholder="セクション名を入力（Enterで追加、Escで閉じる）"
            @keydown.enter="confirmAddSection"
            @keydown.esc="addingSection = false"
            @blur="addingSection = false"
          />
        </div>
        <button
          v-else
          class="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-info py-2 opacity-60 hover:opacity-100 transition-opacity"
          @click="openAddSection(null)"
        >
          <span>🗂️</span><span>セクションを追加</span>
        </button>
      </div>

      <!-- anchor 指定（上/下）のセクション追加インライン入力 -->
      <div
        v-if="addingSection && addSectionAnchor"
        class="fixed inset-0 z-40 flex items-start justify-center pt-32 bg-black/20"
        @click.self="addingSection = false"
      >
        <div class="bg-card border border-border rounded-md shadow-lg p-3 w-80">
          <div class="text-xs text-muted-foreground mb-2">
            セクションを{{ addSectionAnchor.pos === 'above' ? '上' : '下' }}に追加
          </div>
          <input
            v-model.trim="newSectionTitle"
            autofocus
            class="w-full text-sm font-semibold bg-background border border-input rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary"
            placeholder="セクション名（Enterで追加）"
            @keydown.enter="confirmAddSection"
            @keydown.esc="addingSection = false"
          />
        </div>
      </div>
    </div>

    <!-- リスト×ステータス/優先度グループ -->
    <div v-if="layout === 'list' && groupMode !== 'section'" class="mt-2 space-y-4">
      <div v-for="b in flatBuckets" :key="b.key">
        <div class="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold bg-muted/40 rounded">
          <span>{{ b.label }}</span>
          <span class="text-xs text-muted-foreground font-normal">{{ b.tasks.length }}</span>
        </div>
        <div class="mt-0.5">
          <TaskRow
            v-for="t in b.tasks"
            :key="t.id"
            :task="t"
            :draggable="true"
            @toggle="toggleStatus"
            @click="openTask"
          />
          <div v-if="b.tasks.length === 0" class="text-xs text-muted-foreground/70 italic py-1 px-2">なし</div>
        </div>
      </div>
    </div>

    <!-- ボード（列間ドロップでグループ化軸の属性を変更） -->
    <div v-if="layout === 'board'" class="mt-2 flex gap-3 overflow-x-auto items-start pb-4">
      <div
        v-for="col in flatBuckets"
        :key="col.key"
        class="w-[280px] shrink-0 bg-muted/40 rounded-lg p-2"
        :class="{ 'ring-2 ring-primary': boardDropHover === col.key }"
        @dragover.prevent="boardDropHover = col.key"
        @dragleave="boardDropHover === col.key && (boardDropHover = null)"
        @drop.prevent="onBoardDrop(col)"
      >
        <div class="flex items-center gap-2 px-1 pb-2 text-sm font-semibold">
          <span>{{ col.label }}</span>
          <span class="text-xs text-muted-foreground font-normal">{{ col.tasks.length }}</span>
        </div>
        <div class="space-y-1.5 min-h-8">
          <div v-for="t in col.tasks" :key="t.id" class="bg-card border border-border rounded-md shadow-sm">
            <TaskRow :task="t" :draggable="true" @toggle="toggleStatus" @click="openTask" />
          </div>
        </div>
      </div>
    </div>

    <!-- 完了 (showCompleted=true のときのみ折りたたみで表示) -->
    <section v-if="layout === 'list' && groupMode === 'section' && showCompleted && doneTotal > 0" class="mt-6 border-t border-border">
      <button
        class="w-full flex items-center gap-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 -mx-2 px-2 rounded"
        @click="collapsed['done'] = !collapsed['done']"
      >
        <span class="text-xs w-3">{{ collapsed['done'] ? '▸' : '▾' }}</span>
        <span class="w-2 h-2 rounded-full bg-success"></span>
        <span>完了</span>
        <span class="text-xs font-normal">{{ doneTotal }}</span>
      </button>
      <div v-show="!collapsed['done']" class="pb-2 opacity-70">
        <TaskTreeRow
          v-for="n in doneLooseTrees"
          :key="n.task.id"
          :node="n"
          :group-slug="groupSlug"
          :project-slug="projectSlug"
          @toggle="toggleStatus"
          @click="openTask"
        />
        <div v-for="sec in doneSections" :key="sec.task.id" class="mt-2">
          <div class="px-2 py-1 text-xs text-muted-foreground flex items-center gap-2">
            <span>🗂️</span><span>{{ sec.task.title }}</span>
          </div>
          <div class="ml-4 border-l border-border pl-2">
            <TaskTreeRow
              v-for="n in sec.children"
              :key="n.task.id"
              :node="n"
              :group-slug="groupSlug"
              :project-slug="projectSlug"
              @toggle="toggleStatus"
              @click="openTask"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
