<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useZoomPan } from '@/composables/useZoomPan'
import AtlasToolbar, { type AtlasTool } from '@/components/atlas/AtlasToolbar.vue'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)
const canvasEl = ref<HTMLDivElement | null>(null)

const { scale, panX, panY, isPanning, setupHandlers, cleanup, reset, zoomBy, toWorld, fitTo } = useZoomPan({
  minScale: 0.2, maxScale: 4,
})
onMounted(() => setupHandlers(canvasEl.value))
onBeforeUnmount(cleanup)

let didInitialFit = false
function fitAll() {
  const items: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const s of layoutData.value.sections) {
    items.push({ x: s.x, y: s.y, w: s.w, h: s.h })
  }
  for (const n of layoutData.value.taskNodes) {
    items.push({ x: n.x, y: n.y, w: TASK_W, h: TASK_H })
  }
  for (const a of annotations.value) {
    items.push({ x: a.x, y: a.y, w: a.width, h: a.height })
  }
  if (items.length === 0) return
  const minX = Math.min(...items.map(i => i.x))
  const minY = Math.min(...items.map(i => i.y))
  const maxX = Math.max(...items.map(i => i.x + i.w))
  const maxY = Math.max(...items.map(i => i.y + i.h))
  fitTo({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 60)
}

const tool = ref<AtlasTool>('select')
const availableTools: AtlasTool[] = ['select', 'section', 'task', 'message', 'link', 'pen', 'eraser']

interface Annotation { id: string; text: string; x: number; y: number; width: number; height: number; color: number; rotation: number }
interface Link { id: string; from_type: string; from_id: string; to_type: string; to_id: string; kind: string }
interface LayoutEntry { node_type: string; node_id: string; x: number; y: number; width: number | null; height: number | null }
interface Drawing { id: string; points: string; color: string; stroke_width: number }

const annotations = ref<Annotation[]>([])
const links = ref<Link[]>([])
const layout = ref<Map<string, LayoutEntry>>(new Map())
const drawings = ref<Drawing[]>([])

const editingAnnotationId = ref<string | null>(null)
const editAnnotationText = ref('')

// === 新規 state（インライン作成・選択・スナップ・コンテキストメニュー） ===
type InlineCreate =
  | { kind: 'task'; x: number; y: number; parentSectionId: string | null; title: string }
  | { kind: 'section'; x: number; y: number; title: string }
const inlineCreate = ref<InlineCreate | null>(null)

const editingSectionId = ref<string | null>(null)
const editSectionTitle = ref('')

const selectedNodeIds = ref<Set<string>>(new Set())
const boxSelect = ref<{ startX: number; startY: number; x: number; y: number } | null>(null)

const dragHoverSectionId = ref<string | null>(null)
const snapGuides = ref<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] })
const SNAP_THRESHOLD = 6

// セクションリサイズ中の cols / minH 一時上書き（DB は mouseUp で確定）
const resizeOverride = ref<{ sectionId: string; cols: number; minH: number } | null>(null)

// 複数選択タスクの同時ドラッグ用：先頭タスク以外の追従情報
const multiDrag = ref<{
  primaryTaskId: string
  others: Array<{ taskId: string; startX: number; startY: number; originalParentId: string | null; currentX: number; currentY: number }>
} | null>(null)

interface ContextMenu {
  x: number; y: number
  mode: 'pane' | 'task' | 'section' | 'annotation'
  worldX: number; worldY: number
  targetId?: string
}
const contextMenu = ref<ContextMenu | null>(null)

// ツールバーからドラッグして配置するための armed 状態
const armedTool = ref<AtlasTool | null>(null)
const ghostCursor = ref<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false })

// 完了タスクを隠す（インボックスと挙動を揃えるためデフォルト ON）
const hideCompleted = ref(true)
try {
  const saved = localStorage.getItem('atlas:hideCompleted')
  if (saved != null) hideCompleted.value = saved === '1'
} catch {}
watch(hideCompleted, (v) => {
  try { localStorage.setItem('atlas:hideCompleted', v ? '1' : '0') } catch {}
})

const ANNOTATION_COLORS = [
  { bg: '#FFF59D', border: '#FBC02D' },
  { bg: '#F8BBD0', border: '#E91E63' },
  { bg: '#C5E1A5', border: '#7CB342' },
  { bg: '#90CAF9', border: '#1976D2' },
  { bg: '#CE93D8', border: '#8E24AA' },
  { bg: '#FFCC80', border: '#F57C00' },
]

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  const project = await projectsStore.fetchProjectBySlug(groupSlug.value, projectSlug.value)
  if (!project || !groupsStore.currentGroup?.id) return
  const gid = groupsStore.currentGroup.id
  await tasksStore.fetchProjectTasks(project.id)
  const r = await api(`/api/atlas/groups/${gid}?project_id=${project.id}`)
  if (r.ok) {
    const data = await r.json()
    annotations.value = data.annotations
    links.value = data.links
    drawings.value = data.drawings
    layout.value = new Map((data.layout as LayoutEntry[]).map(e => [`${e.node_type}:${e.node_id}`, e]))
  }
  if (!didInitialFit) {
    didInitialFit = true
    setTimeout(() => fitAll(), 50)
  }
}
onMounted(load)
watch([groupSlug, projectSlug], () => { didInitialFit = false; load() })

// タブ復帰・ウィンドウフォーカス時に再フェッチ（AI 等の外部追加への追随）
async function refetchTasksOnly() {
  if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
}
function onVisibilityChange() {
  if (document.visibilityState === 'visible') refetchTasksOnly()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', refetchTasksOnly)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', refetchTasksOnly)
})

const project = computed(() => projectsStore.currentProject)

async function saveLayout(nodeType: string, nodeId: string, x: number, y: number, w?: number, h?: number) {
  if (!groupsStore.currentGroup?.id || !project.value?.id) return
  layout.value.set(`${nodeType}:${nodeId}`, {
    node_type: nodeType, node_id: nodeId, x, y, width: w ?? null, height: h ?? null,
  })
  layout.value = new Map(layout.value)
  await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/layout/${nodeType}/${nodeId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, width: w, height: h, project_id: project.value.id }),
  })
}


// === レイアウト定数 ===
const TASK_W = 160
const TASK_H = 80
const TASK_GAP = 10
const SECTION_DEFAULT_COLS = 2
const REGION_PADDING = 14
const SECTION_HEADER_H = 38
// セクション作成時の初期サイズ計算用（実際の幅は cols に応じて自動算出）
const SECTION_W = SECTION_DEFAULT_COLS * TASK_W + (SECTION_DEFAULT_COLS - 1) * TASK_GAP + REGION_PADDING * 2

interface SectionLayout {
  task: Task
  childTasks: Task[]      // 表示対象（hideCompleted フィルタ後）
  allChildren: Task[]     // 全 direct child
  x: number; y: number; w: number; h: number
  cols: number
}

interface TaskNode {
  task: Task
  x: number; y: number
  parentSectionId: string | null
  isMember: boolean         // section の直接メンバーなら true（位置はセクションが所有）
  subtaskCount: number      // 孫タスク（atlas には出さない）の数
}

const layoutData = computed(() => {
  const tasks = tasksStore.tasks.filter(t => t.project_id === project.value?.id)

  // section ID 集合（is_section=1、または atlas_layout に section エントリがある旧データ）
  const sectionIds = new Set<string>()
  for (const t of tasks) {
    if (t.is_section) sectionIds.add(t.id)
  }
  for (const key of layout.value.keys()) {
    if (key.startsWith('section:')) {
      const sid = key.slice('section:'.length)
      if (tasks.some(t => t.id === sid)) sectionIds.add(sid)
    }
  }

  // 各 section の direct children を sort_order 順で
  const sectionChildren = new Map<string, Task[]>()
  for (const sid of sectionIds) sectionChildren.set(sid, [])
  for (const t of tasks) {
    if (t.is_section) continue
    if (!t.parent_task_id || !sectionIds.has(t.parent_task_id)) continue
    sectionChildren.get(t.parent_task_id)!.push(t)
  }
  for (const arr of sectionChildren.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  // 子タスク数（atlas に出ない孫の数を親カードにバッジ表示する用）
  const childCount = new Map<string, number>()
  for (const t of tasks) {
    if (!t.parent_task_id) continue
    childCount.set(t.parent_task_id, (childCount.get(t.parent_task_id) || 0) + 1)
  }

  // セクション計算（サイズは子数で自動）
  const sections: SectionLayout[] = []
  let autoY = 80
  for (const t of tasks) {
    if (!sectionIds.has(t.id)) continue
    const allChildren = sectionChildren.get(t.id) || []
    const childTasks = hideCompleted.value
      ? allChildren.filter(c => c.status !== 'completed')
      : allChildren
    const override = resizeOverride.value?.sectionId === t.id ? resizeOverride.value : null
    const cols = override?.cols ?? Math.max(1, Math.min(6, (t as any).atlas_columns ?? SECTION_DEFAULT_COLS))
    const visibleCount = Math.max(1, childTasks.length)
    const rows = Math.ceil(visibleCount / cols)
    const w = cols * TASK_W + (cols - 1) * TASK_GAP + REGION_PADDING * 2
    const contentH = SECTION_HEADER_H + REGION_PADDING + rows * TASK_H + (rows - 1) * TASK_GAP + REGION_PADDING
    const saved = layout.value.get(`section:${t.id}`)
    // ユーザーが下方向に伸ばした最小高さを尊重（content より大きければそちらを使う）
    const minH = override?.minH ?? saved?.height ?? contentH
    const h = Math.max(contentH, minH)
    const x = saved?.x ?? 80
    const y = saved?.y ?? autoY
    sections.push({ task: t, childTasks, allChildren, x, y, w, h, cols })
    if (!saved) autoY += h + 30
  }

  // タスクノード配置
  const taskNodes: TaskNode[] = []
  // standalone を section の右側に置く起点
  const looseX = (sections.length > 0 ? Math.max(...sections.map(s => s.x + s.w)) : 0) + 80
  let looseAutoY = 80

  for (const t of tasks) {
    if (t.is_section) continue
    if (hideCompleted.value && t.status === 'completed') continue
    // 孫（section ではないタスクの子）は atlas に出さない → 親カードにバッジ
    if (t.parent_task_id && !sectionIds.has(t.parent_task_id)) continue

    const parentSec = t.parent_task_id ? sections.find(s => s.task.id === t.parent_task_id) : null
    let x: number, y: number, isMember = false
    if (parentSec) {
      const idx = parentSec.childTasks.findIndex(c => c.id === t.id)
      if (idx < 0) continue
      const col = idx % parentSec.cols
      const row = Math.floor(idx / parentSec.cols)
      x = parentSec.x + REGION_PADDING + col * (TASK_W + TASK_GAP)
      y = parentSec.y + SECTION_HEADER_H + REGION_PADDING + row * (TASK_H + TASK_GAP)
      isMember = true
    } else {
      // standalone（保存位置を尊重）
      const saved = layout.value.get(`task:${t.id}`)
      if (saved) {
        x = saved.x; y = saved.y
      } else {
        x = looseX
        y = looseAutoY
        looseAutoY += TASK_H + 16
      }
    }
    taskNodes.push({
      task: t, x, y,
      parentSectionId: parentSec?.task.id ?? null,
      isMember,
      subtaskCount: childCount.get(t.id) ?? 0,
    })
  }

  // 大きいセクションを先に並べる（DOM順で先=下、後=上に来る）
  sections.sort((a, b) => (b.w * b.h) - (a.w * a.h))

  return { sections, taskNodes }
})

interface Rect { x: number; y: number; w: number; h: number }

function nodeRect(type: string, id: string): Rect | null {
  if (type === 'section') {
    const s = layoutData.value.sections.find(x => x.task.id === id)
    if (s) return { x: s.x, y: s.y, w: s.w, h: s.h }
  }
  if (type === 'task') {
    const n = layoutData.value.taskNodes.find(x => x.task.id === id)
    if (n) return { x: n.x, y: n.y, w: TASK_W, h: TASK_H }
  }
  if (type === 'annotation') {
    const a = annotations.value.find(x => x.id === id)
    if (a) return { x: a.x, y: a.y, w: a.width, h: a.height }
  }
  return null
}

function clipFromRectCenter(rect: Rect, towardX: number, towardY: number) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfW = rect.w / 2
  const halfH = rect.h / 2
  const tX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const tY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const t = Math.min(tX, tY)
  return { x: cx + dx * t, y: cy + dy * t }
}

// === ドラッグ ===
type Drag =
  | { kind: 'section'; id: string; offsetX: number; offsetY: number }
  | { kind: 'sectionResize'; id: string; startMouseX: number; startMouseY: number; startW: number; startH: number; startCols: number }
  | { kind: 'task'; id: string; offsetX: number; offsetY: number; x: number; y: number; originalParentId: string | null }
  | { kind: 'annotation'; id: string; offsetX: number; offsetY: number }
  | { kind: 'pen'; points: number[][] }

const drag = ref<Drag | null>(null)
const linkStart = ref<{ type: string; id: string; mouseX: number; mouseY: number } | null>(null)

function onWindowKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    tool.value = 'select'
    linkStart.value = null
    armedTool.value = null
    ghostCursor.value.visible = false
    closeContextMenu()
    if (inlineCreate.value) { cancelInlineCreate(); return }
    if (editingSectionId.value) { editingSectionId.value = null; return }
    selectedNodeIds.value = new Set()
    return
  }
  // 編集系がアクティブなとき keyboard shortcut を無効化
  const isTyping = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)
  if (isTyping) return
  if (inlineCreate.value || editingSectionId.value || editingAnnotationId.value) return

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.value.size > 0) {
    e.preventDefault()
    if (confirm(`選択中の ${selectedNodeIds.value.size} 件を削除？`)) bulkDelete()
    return
  }
  // 矢印 nudge
  if (selectedNodeIds.value.size > 0 && e.key.startsWith('Arrow')) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    let dx = 0, dy = 0
    if (e.key === 'ArrowLeft') dx = -step
    if (e.key === 'ArrowRight') dx = step
    if (e.key === 'ArrowUp') dy = -step
    if (e.key === 'ArrowDown') dy = step
    nudgeSelected(dx, dy)
    return
  }
  // ツールショートカット
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase()
    if (k === 'v') tool.value = 'select'
    else if (k === 't') tool.value = 'task'
    else if (k === 's') tool.value = 'section'
    else if (k === 'm') tool.value = 'message'
    else if (k === 'l') tool.value = 'link'
    else if (k === 'p') tool.value = 'pen'
    else if (k === 'e') tool.value = 'eraser'
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))

// === 複数選択操作 ===
function nodeKey(type: string, id: string) { return `${type}:${id}` }
function isSelected(type: string, id: string) { return selectedNodeIds.value.has(nodeKey(type, id)) }

function toggleSelect(type: string, id: string, additive: boolean) {
  const k = nodeKey(type, id)
  if (additive) {
    const next = new Set(selectedNodeIds.value)
    if (next.has(k)) next.delete(k); else next.add(k)
    selectedNodeIds.value = next
  } else {
    selectedNodeIds.value = new Set([k])
  }
}

async function nudgeSelected(dx: number, dy: number) {
  for (const k of selectedNodeIds.value) {
    const [type, id] = k.split(':', 2) as [string, string]
    if (type === 'task') {
      const cur = layout.value.get(`task:${id}`)
      const n = layoutData.value.taskNodes.find(n => n.task.id === id)
      const baseX = cur?.x ?? n?.x ?? 0
      const baseY = cur?.y ?? n?.y ?? 0
      await saveLayout('task', id, baseX + dx, baseY + dy)
    } else if (type === 'section') {
      const sec = layoutData.value.sections.find(s => s.task.id === id)
      if (sec) {
        await saveLayout('section', id, sec.x + dx, sec.y + dy, sec.w, sec.h)
        for (const c of sec.childTasks) {
          const cl = layout.value.get(`task:${c.id}`)
          if (cl) await saveLayout('task', c.id, cl.x + dx, cl.y + dy)
        }
      }
    } else if (type === 'annotation') {
      const ann = annotations.value.find(a => a.id === id)
      if (ann) {
        ann.x += dx; ann.y += dy
        await api(`/api/atlas/annotations/${ann.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: ann.x, y: ann.y }),
        })
      }
    }
  }
}

async function bulkDelete() {
  for (const k of selectedNodeIds.value) {
    const [type, id] = k.split(':', 2) as [string, string]
    if (type === 'task' || type === 'section') {
      await api(`/api/tasks/${id}`, { method: 'DELETE' })
    } else if (type === 'annotation') {
      await api(`/api/atlas/annotations/${id}`, { method: 'DELETE' })
      annotations.value = annotations.value.filter(a => a.id !== id)
    }
  }
  selectedNodeIds.value = new Set()
  if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
}

// === コンテキストメニュー ===
function onCanvasContextMenu(e: MouseEvent) {
  if (!canvasEl.value) return
  e.preventDefault()
  const target = e.target as HTMLElement
  if (target.closest('.atlas-toolbar') || target.closest('.zoom-controls')) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  const taskEl = target.closest('[data-node="task"]') as HTMLElement | null
  const secEl = target.closest('[data-node="section"]') as HTMLElement | null
  const annEl = target.closest('[data-node="annotation"]') as HTMLElement | null
  let mode: ContextMenu['mode'] = 'pane'
  let targetId: string | undefined
  if (taskEl) { mode = 'task'; targetId = taskEl.getAttribute('data-task-id') ?? undefined }
  else if (secEl) { mode = 'section'; targetId = secEl.getAttribute('data-section-id') ?? undefined }
  else if (annEl) { mode = 'annotation'; targetId = annEl.getAttribute('data-annotation-id') ?? undefined }
  contextMenu.value = { x: e.clientX, y: e.clientY, mode, worldX: w.x, worldY: w.y, targetId }
}

function closeContextMenu() { contextMenu.value = null }

function ctxAddTaskHere() {
  if (!contextMenu.value) return
  const w = { x: contextMenu.value.worldX, y: contextMenu.value.worldY }
  const section = findSectionAt(w.x, w.y)
  inlineCreate.value = {
    kind: 'task',
    x: w.x - TASK_W / 2, y: w.y - TASK_H / 2,
    parentSectionId: section?.task.id ?? null,
    title: '',
  }
  closeContextMenu()
  nextTick(() => focusInlineCreateInput())
}

function ctxAddSectionHere() {
  if (!contextMenu.value) return
  const w = { x: contextMenu.value.worldX, y: contextMenu.value.worldY }
  const t = avoidHeaderCollision(w.x - SECTION_W / 2, w.y - 30)
  inlineCreate.value = { kind: 'section', x: t.x, y: t.y, title: '' }
  closeContextMenu()
  nextTick(() => focusInlineCreateInput())
}

async function ctxAddMessageHere() {
  if (!contextMenu.value || !groupsStore.currentGroup?.id || !project.value?.id) return
  const w = { x: contextMenu.value.worldX, y: contextMenu.value.worldY }
  const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/annotations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: project.value.id, text: '', x: w.x - 100, y: w.y - 50,
      width: 200, height: 100, color: Math.floor(Math.random() * 6),
    }),
  })
  if (res.ok) { const ann = await res.json(); annotations.value.push(ann); startEditAnnotation(ann) }
  closeContextMenu()
}

async function ctxDelete() {
  if (!contextMenu.value?.targetId) return
  const { mode, targetId } = contextMenu.value
  if (mode === 'task' || mode === 'section') {
    await api(`/api/tasks/${targetId}`, { method: 'DELETE' })
    if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
  } else if (mode === 'annotation') {
    await api(`/api/atlas/annotations/${targetId}`, { method: 'DELETE' })
    annotations.value = annotations.value.filter(a => a.id !== targetId)
  }
  closeContextMenu()
}

function ctxStartLink() {
  if (!contextMenu.value?.targetId) return
  tool.value = 'link'
  linkStart.value = {
    type: contextMenu.value.mode,
    id: contextMenu.value.targetId,
    mouseX: contextMenu.value.worldX,
    mouseY: contextMenu.value.worldY,
  }
  document.addEventListener('mousemove', onLinkMove)
  closeContextMenu()
}

// === セクションタイトル in-place 編集 ===
function startEditSectionTitle(sec: SectionLayout) {
  editingSectionId.value = sec.task.id
  editSectionTitle.value = sec.task.title
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.atlas-section-title-edit input')
    el?.focus(); el?.select()
  })
}

async function commitSectionTitle() {
  if (!editingSectionId.value) return
  const id = editingSectionId.value
  const newTitle = editSectionTitle.value.trim()
  const sec = layoutData.value.sections.find(s => s.task.id === id)
  editingSectionId.value = null
  if (!newTitle || !sec || newTitle === sec.task.title) return
  await tasksStore.updateTask(id, { title: newTitle, updated_by: userStore.currentUser?.id } as any)
  if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
}

// ドロップ位置からセクションメンバー配列の挿入 index を計算
function computeInsertIndex(sec: SectionLayout, dropCx: number, dropCy: number, excludeId?: string): number {
  const visible = sec.childTasks.filter(c => c.id !== excludeId)
  if (visible.length === 0) return 0
  const localX = dropCx - sec.x - REGION_PADDING
  const localY = dropCy - sec.y - SECTION_HEADER_H - REGION_PADDING
  const col = Math.max(0, Math.min(sec.cols - 1, Math.floor((localX + TASK_W / 2) / (TASK_W + TASK_GAP))))
  const row = Math.max(0, Math.floor((localY + TASK_H / 2) / (TASK_H + TASK_GAP)))
  return Math.min(row * sec.cols + col, visible.length)
}

// タスクをセクションのメンバーとして配置（parent + sort_order 更新）
async function placeTaskInSection(taskId: string, sec: SectionLayout, insertIdx: number, originalParentId: string | null) {
  // 同一セクション内ならメンバー配列内で並べ替え、別セクションへの移動なら所属変更
  const otherMembers = sec.allChildren.filter(c => c.id !== taskId)
  const reordered = [...otherMembers]
  const clamped = Math.max(0, Math.min(insertIdx, reordered.length))
  // taskId が allChildren に既に居なくても、ここで挿入
  const draggedTask = tasksStore.tasks.find(t => t.id === taskId)
  if (draggedTask) reordered.splice(clamped, 0, draggedTask)

  // sort_order を再採番（10 刻みで余裕を持たせる）
  const updates = reordered.map((t, idx) => ({
    id: t.id,
    sort_order: idx * 10,
    parent_task_id: sec.task.id,
  }))
  await api('/api/tasks/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: updates }),
  })
  // メンバーになったら個別レイアウト position は不要（section が所有）→ DB の atlas_layout エントリは残るが描画時に無視される
  if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
  void originalParentId
}

async function changeSectionColumns(sec: SectionLayout, cols: number) {
  await tasksStore.updateTask(sec.task.id, {
    atlas_columns: Math.max(1, Math.min(6, cols)),
    updated_by: userStore.currentUser?.id,
  } as any)
  if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
}

async function onCanvasMouseDown(e: MouseEvent) {
  if (e.button !== 0 || isPanning.value) return
  const target = e.target as HTMLElement
  if (target.closest('.atlas-toolbar') || target.closest('.zoom-controls')) return
  if (target.closest('.atlas-context-menu') || target.closest('.atlas-inline-create')) return
  closeContextMenu()
  const onNode = target.closest('[data-node]')
  if (onNode && (tool.value === 'select' || tool.value === 'link' || tool.value === 'eraser')) return
  if (!canvasEl.value || !project.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())

  if (tool.value === 'task') {
    // インライン作成: 空のカードを配置し title input にフォーカス
    const section = findSectionAt(w.x, w.y)
    inlineCreate.value = {
      kind: 'task',
      x: w.x - TASK_W / 2, y: w.y - TASK_H / 2,
      parentSectionId: section?.task.id ?? null,
      title: '',
    }
    nextTick(() => focusInlineCreateInput())
    tool.value = 'select'
  } else if (tool.value === 'section') {
    const target = avoidHeaderCollision(w.x - SECTION_W / 2, w.y - 30)
    inlineCreate.value = { kind: 'section', x: target.x, y: target.y, title: '' }
    nextTick(() => focusInlineCreateInput())
    tool.value = 'select'
  } else if (tool.value === 'message') {
    if (!groupsStore.currentGroup?.id) return
    const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/annotations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.value.id, text: '', x: w.x - 100, y: w.y - 50,
        width: 200, height: 100, color: Math.floor(Math.random() * 6),
      }),
    })
    if (res.ok) { const ann = await res.json(); annotations.value.push(ann); startEditAnnotation(ann) }
    tool.value = 'select'
  } else if (tool.value === 'link') {
    linkStart.value = null
  } else if (tool.value === 'pen') {
    drag.value = { kind: 'pen', points: [[w.x, w.y]] }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  } else if (tool.value === 'select') {
    // 空白でドラッグ → box select
    if (!e.shiftKey) selectedNodeIds.value = new Set()
    boxSelect.value = { startX: w.x, startY: w.y, x: w.x, y: w.y }
    document.addEventListener('mousemove', onBoxSelectMove)
    document.addEventListener('mouseup', onBoxSelectUp)
  }
}

function onBoxSelectMove(e: MouseEvent) {
  if (!boxSelect.value || !canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  boxSelect.value.x = w.x
  boxSelect.value.y = w.y
}

function onBoxSelectUp() {
  document.removeEventListener('mousemove', onBoxSelectMove)
  document.removeEventListener('mouseup', onBoxSelectUp)
  const bs = boxSelect.value
  boxSelect.value = null
  if (!bs) return
  const minX = Math.min(bs.startX, bs.x), maxX = Math.max(bs.startX, bs.x)
  const minY = Math.min(bs.startY, bs.y), maxY = Math.max(bs.startY, bs.y)
  if (maxX - minX < 4 && maxY - minY < 4) return // クリック扱い
  const picked = new Set<string>(selectedNodeIds.value) // shift で加算
  for (const n of layoutData.value.taskNodes) {
    if (n.x + TASK_W >= minX && n.x <= maxX && n.y + TASK_H >= minY && n.y <= maxY) {
      picked.add(`task:${n.task.id}`)
    }
  }
  for (const s of layoutData.value.sections) {
    if (s.x + s.w >= minX && s.x <= maxX && s.y + s.h >= minY && s.y <= maxY) {
      picked.add(`section:${s.task.id}`)
    }
  }
  for (const a of annotations.value) {
    if (a.x + a.width >= minX && a.x <= maxX && a.y + a.height >= minY && a.y <= maxY) {
      picked.add(`annotation:${a.id}`)
    }
  }
  selectedNodeIds.value = picked
}

function focusInlineCreateInput() {
  const el = document.querySelector<HTMLInputElement>('.atlas-inline-create input')
  el?.focus(); el?.select()
}

async function commitInlineCreate() {
  const ic = inlineCreate.value
  if (!ic) return
  const title = ic.title.trim()
  if (!title || !userStore.currentUser?.id || !project.value?.id) {
    inlineCreate.value = null
    return
  }
  inlineCreate.value = null
  if (ic.kind === 'task') {
    const created = await tasksStore.createTask({
      project_id: project.value.id, title,
      parent_task_id: ic.parentSectionId,
      created_by: userStore.currentUser.id,
    } as any)
    if (!ic.parentSectionId) {
      // standalone のみ個別位置を保存
      await saveLayout('task', created.id, ic.x, ic.y)
    }
    await tasksStore.fetchProjectTasks(project.value.id)
  } else if (ic.kind === 'section') {
    const created = await tasksStore.createTask({
      project_id: project.value.id, title, is_section: true,
      created_by: userStore.currentUser.id,
    } as any)
    await saveLayout('section', created.id, ic.x, ic.y)
    await tasksStore.fetchProjectTasks(project.value.id)
  }
}

function cancelInlineCreate() {
  inlineCreate.value = null
}

function findSectionAt(x: number, y: number, excludeId?: string): SectionLayout | null {
  // 含むセクションのうち最も小さいもの（最も深い入れ子）を返す
  let result: SectionLayout | null = null
  let minArea = Infinity
  for (const s of layoutData.value.sections) {
    if (excludeId && s.task.id === excludeId) continue
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
      const area = s.w * s.h
      if (area < minArea) { minArea = area; result = s }
    }
  }
  return result
}

// セクションヘッダーが他セクションのヘッダーとほぼ同じ位置にある場合は自動オフセット
function avoidHeaderCollision(x: number, y: number, excludeId?: string): { x: number; y: number } {
  const HEADER_HIT = 40
  const STEP = 28
  let nx = x, ny = y, attempts = 0
  while (attempts < 30) {
    const collision = layoutData.value.sections.find(s => {
      if (excludeId && s.task.id === excludeId) return false
      return Math.abs(s.x - nx) < HEADER_HIT && Math.abs(s.y - ny) < HEADER_HIT
    })
    if (!collision) return { x: nx, y: ny }
    nx += STEP; ny += STEP; attempts++
  }
  return { x: nx, y: ny }
}

// === セクションリサイズ ===
// セクション右下からのリサイズ（幅で cols、高さで最小高さ）
function onSectionResizeMouseDown(e: MouseEvent, sec: SectionLayout) {
  if (tool.value !== 'select') return
  if (e.button !== 0) return
  e.stopPropagation()
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  drag.value = {
    kind: 'sectionResize', id: sec.task.id,
    startMouseX: w.x, startMouseY: w.y,
    startW: sec.w, startH: sec.h, startCols: sec.cols,
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// === セクション操作 ===
function onSectionHeaderMouseDown(e: MouseEvent, sec: SectionLayout) {
  if (e.button !== 0 || isPanning.value) return
  if ((e.target as HTMLElement).closest('button')) return

  if (tool.value === 'eraser') {
    e.stopPropagation()
    if (confirm(`セクション「${sec.task.title}」を削除？子タスクも消えます`)) {
      api(`/api/tasks/${sec.task.id}`, { method: 'DELETE' }).then(async () => {
        if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
      })
    }
    return
  }
  if (tool.value === 'link') {
    e.stopPropagation()
    handleLinkClick('section', sec.task.id, e)
    return
  }
  if (tool.value !== 'select') return

  e.stopPropagation()
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  drag.value = { kind: 'section', id: sec.task.id, offsetX: w.x - sec.x, offsetY: w.y - sec.y }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// === タスク操作 ===
function onTaskMouseDown(e: MouseEvent, task: Task, currentX: number, currentY: number) {
  if (e.button !== 0 || isPanning.value) return
  if ((e.target as HTMLElement).closest('button')) return

  if (tool.value === 'eraser') {
    e.stopPropagation()
    if (confirm(`「${task.title}」を削除？`)) {
      api(`/api/tasks/${task.id}`, { method: 'DELETE' }).then(async () => {
        if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
      })
    }
    return
  }
  if (tool.value === 'link') {
    e.stopPropagation()
    handleLinkClick('task', task.id, e)
    return
  }
  if (tool.value !== 'select') return

  e.stopPropagation()
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  drag.value = {
    kind: 'task', id: task.id,
    offsetX: w.x - currentX, offsetY: w.y - currentY,
    x: currentX, y: currentY,
    originalParentId: task.parent_task_id,
  }
  // 複数選択時の追従セットアップ
  const selectedTaskKey = `task:${task.id}`
  if (selectedNodeIds.value.has(selectedTaskKey) && selectedNodeIds.value.size > 1) {
    const others: Array<{ taskId: string; startX: number; startY: number; originalParentId: string | null; currentX: number; currentY: number }> = []
    for (const k of selectedNodeIds.value) {
      if (!k.startsWith('task:')) continue
      const otherId = k.slice('task:'.length)
      if (otherId === task.id) continue
      const otherNode = layoutData.value.taskNodes.find(n => n.task.id === otherId)
      if (!otherNode) continue
      others.push({
        taskId: otherId,
        startX: otherNode.x, startY: otherNode.y,
        currentX: otherNode.x, currentY: otherNode.y,
        originalParentId: otherNode.task.parent_task_id,
      })
    }
    if (others.length > 0) multiDrag.value = { primaryTaskId: task.id, others }
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onAnnotationMouseDown(e: MouseEvent, ann: Annotation) {
  if (e.button !== 0 || isPanning.value) return
  if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('textarea')) return

  if (tool.value === 'eraser') { e.stopPropagation(); deleteAnnotation(ann); return }
  if (tool.value === 'link') { e.stopPropagation(); handleLinkClick('annotation', ann.id, e); return }
  if (tool.value !== 'select') return

  e.stopPropagation()
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  drag.value = { kind: 'annotation', id: ann.id, offsetX: w.x - ann.x, offsetY: w.y - ann.y }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function startEditAnnotation(ann: Annotation) {
  editingAnnotationId.value = ann.id
  editAnnotationText.value = ann.text || ''
  nextTick(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea.annotation-edit')
    el?.focus(); el?.select()
  })
}

async function saveAnnotation() {
  if (!editingAnnotationId.value) return
  const ann = annotations.value.find(a => a.id === editingAnnotationId.value)
  if (!ann) { editingAnnotationId.value = null; return }
  if (editAnnotationText.value !== ann.text) {
    await api(`/api/atlas/annotations/${ann.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editAnnotationText.value }),
    })
    ann.text = editAnnotationText.value
  }
  editingAnnotationId.value = null
}

async function cycleAnnotationColor(ann: Annotation) {
  const newColor = (ann.color + 1) % ANNOTATION_COLORS.length
  await api(`/api/atlas/annotations/${ann.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color: newColor }),
  })
  ann.color = newColor
}

async function deleteAnnotation(ann: Annotation) {
  await api(`/api/atlas/annotations/${ann.id}`, { method: 'DELETE' })
  annotations.value = annotations.value.filter(a => a.id !== ann.id)
}

function onMouseMove(e: MouseEvent) {
  if (!drag.value || !canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  if (drag.value.kind === 'section') {
    // セクションだけ動かす（子の位置はセクション相対なので自動で追従）
    const sectionId = drag.value.id
    const newX = w.x - drag.value.offsetX
    const newY = w.y - drag.value.offsetY
    const key = `section:${sectionId}`
    const old = layout.value.get(key)
    layout.value.set(key, {
      node_type: 'section', node_id: sectionId,
      x: newX, y: newY,
      width: old?.width ?? null, height: old?.height ?? null,
    })
    layout.value = new Map(layout.value)
    const sec = layoutData.value.sections.find(s => s.task.id === sectionId)
    if (sec) updateSnapGuides('section', sec.task.id, newX, newY, sec.w, sec.h)
  } else if (drag.value.kind === 'sectionResize') {
    // 幅から cols / 高さから minHeight を更新（DB は mouseUp で確定）
    const newW = Math.max(TASK_W + REGION_PADDING * 2, drag.value.startW + (w.x - drag.value.startMouseX))
    const newH = Math.max(SECTION_HEADER_H + REGION_PADDING * 2 + TASK_H, drag.value.startH + (w.y - drag.value.startMouseY))
    const newCols = Math.max(1, Math.min(6, Math.round((newW - REGION_PADDING * 2 + TASK_GAP) / (TASK_W + TASK_GAP))))
    resizeOverride.value = { sectionId: drag.value.id, cols: newCols, minH: newH }
  } else if (drag.value.kind === 'task') {
    const newX = w.x - drag.value.offsetX
    const newY = w.y - drag.value.offsetY
    const dx = newX - drag.value.x
    const dy = newY - drag.value.y
    drag.value.x = newX
    drag.value.y = newY
    if (multiDrag.value) {
      for (const o of multiDrag.value.others) {
        o.currentX += dx
        o.currentY += dy
      }
    }
    updateSnapGuides('task', drag.value.id, drag.value.x, drag.value.y, TASK_W, TASK_H)
    dragHoverSectionId.value = findSectionAt(drag.value.x + TASK_W / 2, drag.value.y + TASK_H / 2)?.task.id ?? null
  } else if (drag.value.kind === 'annotation') {
    const ann = annotations.value.find(a => a.id === (drag.value as any).id)
    if (ann) {
      ann.x = w.x - drag.value.offsetX
      ann.y = w.y - drag.value.offsetY
      updateSnapGuides('annotation', ann.id, ann.x, ann.y, ann.width, ann.height)
    }
  } else if (drag.value.kind === 'pen') {
    drag.value.points.push([w.x, w.y])
  }
}

// ドラッグ中ノードの各辺・中心が他ノードの辺・中心と SNAP_THRESHOLD 以内に近い場合、整列補助線を出す
function updateSnapGuides(type: string, id: string, x: number, y: number, w: number, h: number) {
  const myXs = [x, x + w / 2, x + w]
  const myYs = [y, y + h / 2, y + h]
  const vGuides: number[] = []
  const hGuides: number[] = []
  const candidates: Array<{ x: number; y: number; w: number; h: number; id: string; type: string }> = []
  for (const n of layoutData.value.taskNodes) {
    if (type === 'task' && n.task.id === id) continue
    candidates.push({ x: n.x, y: n.y, w: TASK_W, h: TASK_H, id: n.task.id, type: 'task' })
  }
  for (const s of layoutData.value.sections) {
    if (type === 'section' && s.task.id === id) continue
    candidates.push({ x: s.x, y: s.y, w: s.w, h: s.h, id: s.task.id, type: 'section' })
  }
  for (const a of annotations.value) {
    if (type === 'annotation' && a.id === id) continue
    candidates.push({ x: a.x, y: a.y, w: a.width, h: a.height, id: a.id, type: 'annotation' })
  }
  for (const c of candidates) {
    const cXs = [c.x, c.x + c.w / 2, c.x + c.w]
    const cYs = [c.y, c.y + c.h / 2, c.y + c.h]
    for (const mx of myXs) for (const cx of cXs) {
      if (Math.abs(mx - cx) < SNAP_THRESHOLD && !vGuides.includes(cx)) vGuides.push(cx)
    }
    for (const my of myYs) for (const cy of cYs) {
      if (Math.abs(my - cy) < SNAP_THRESHOLD && !hGuides.includes(cy)) hGuides.push(cy)
    }
  }
  snapGuides.value = { vertical: vGuides, horizontal: hGuides }
}

function clearSnapGuides() {
  snapGuides.value = { vertical: [], horizontal: [] }
  dragHoverSectionId.value = null
}

async function onMouseUp(_e: MouseEvent) {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  clearSnapGuides()
  if (!drag.value) return
  const d = drag.value
  drag.value = null

  if (d.kind === 'section') {
    const sec = layoutData.value.sections.find(s => s.task.id === d.id)
    if (sec) {
      const adjusted = avoidHeaderCollision(sec.x, sec.y, sec.task.id)
      await saveLayout('section', d.id, adjusted.x, adjusted.y)
    }
  } else if (d.kind === 'sectionResize') {
    const finalCols = resizeOverride.value?.cols
    const finalMinH = resizeOverride.value?.minH
    resizeOverride.value = null
    const sec = layoutData.value.sections.find(s => s.task.id === d.id)
    // cols が変わっていれば更新
    if (finalCols && finalCols !== d.startCols) {
      await tasksStore.updateTask(d.id, {
        atlas_columns: finalCols,
        updated_by: userStore.currentUser?.id,
      } as any)
    }
    // height が変わっていれば atlas_layout に保存
    if (sec && finalMinH != null && Math.abs(finalMinH - d.startH) > 1) {
      await saveLayout('section', d.id, sec.x, sec.y, undefined, finalMinH)
    }
    if (project.value?.id && finalCols && finalCols !== d.startCols) {
      await tasksStore.fetchProjectTasks(project.value.id)
    }
  } else if (d.kind === 'task') {
    // 複数選択ドラッグ: primary + others を順に処理（位置順で section 内の挿入が安定するよう）
    const md = multiDrag.value
    multiDrag.value = null
    const drops: Array<{ taskId: string; x: number; y: number; originalParentId: string | null }> = [
      { taskId: d.id, x: d.x, y: d.y, originalParentId: d.originalParentId },
    ]
    if (md) {
      for (const o of md.others) {
        drops.push({ taskId: o.taskId, x: o.currentX, y: o.currentY, originalParentId: o.originalParentId })
      }
    }
    // 落としたあとの x → y 順でソート（grid の自然な並び）
    drops.sort((a, b) => (a.y - b.y) || (a.x - b.x))

    for (const drop of drops) {
      const dropCx = drop.x + TASK_W / 2
      const dropCy = drop.y + TASK_H / 2
      const targetSection = findSectionAt(dropCx, dropCy)
      if (targetSection) {
        const insertIdx = computeInsertIndex(targetSection, dropCx, dropCy, drop.taskId)
        await placeTaskInSection(drop.taskId, targetSection, insertIdx, drop.originalParentId)
      } else {
        if (drop.originalParentId) {
          await tasksStore.updateTask(drop.taskId, {
            parent_task_id: null,
            updated_by: userStore.currentUser?.id,
          } as any)
        }
        await saveLayout('task', drop.taskId, drop.x, drop.y)
      }
    }
    if (project.value?.id) await tasksStore.fetchProjectTasks(project.value.id)
  } else if (d.kind === 'annotation') {
    const ann = annotations.value.find(a => a.id === d.id)
    if (ann) {
      await api(`/api/atlas/annotations/${ann.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: ann.x, y: ann.y }),
      })
    }
  } else if (d.kind === 'pen') {
    if (d.points.length >= 2 && groupsStore.currentGroup?.id && project.value?.id) {
      const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/drawings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.value.id, points: d.points, color: '#1f2937', stroke_width: 2 }),
      })
      if (res.ok) drawings.value.push(await res.json())
    }
  }
}

function handleLinkClick(type: string, id: string, e: MouseEvent) {
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  if (!linkStart.value) {
    linkStart.value = { type, id, mouseX: w.x, mouseY: w.y }
    document.addEventListener('mousemove', onLinkMove)
  } else {
    if (!(linkStart.value.type === type && linkStart.value.id === id)) {
      createLink(linkStart.value.type, linkStart.value.id, type, id)
    }
    linkStart.value = null
    document.removeEventListener('mousemove', onLinkMove)
  }
}

function onLinkMove(e: MouseEvent) {
  if (!linkStart.value || !canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  linkStart.value.mouseX = w.x
  linkStart.value.mouseY = w.y
}

async function createLink(fromType: string, fromId: string, toType: string, toId: string) {
  if (!groupsStore.currentGroup?.id || !project.value?.id) return
  const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: project.value.id, from_type: fromType, from_id: fromId, to_type: toType, to_id: toId, kind: 'relates' }),
  })
  if (res.ok) links.value.push(await res.json())
}

async function deleteLink(link: Link) {
  await api(`/api/atlas/links/${link.id}`, { method: 'DELETE' })
  links.value = links.value.filter(l => l.id !== link.id)
}

async function deleteDrawing(d: Drawing) {
  await api(`/api/atlas/drawings/${d.id}`, { method: 'DELETE' })
  drawings.value = drawings.value.filter(x => x.id !== d.id)
}

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  const next = task.status === 'completed' ? 'not_started' : 'completed'
  await tasksStore.updateStatus(task.id, next, userStore.currentUser.id)
  const t = tasksStore.tasks.find(x => x.id === task.id)
  if (t) t.status = next
}

function openTask(task: Task) {
  taskPanelStore.open({
    groupSlug: groupSlug.value,
    projectSlug: projectSlug.value,
    taskId: task.id,
    taskNumber: task.task_number,
  })
}

const linkLines = computed(() => {
  return links.value.map(l => {
    const fromR = nodeRect(l.from_type, l.from_id)
    const toR = nodeRect(l.to_type, l.to_id)
    if (!fromR || !toR) return null
    const fromC = { x: fromR.x + fromR.w / 2, y: fromR.y + fromR.h / 2 }
    const toC = { x: toR.x + toR.w / 2, y: toR.y + toR.h / 2 }
    const from = clipFromRectCenter(fromR, toC.x, toC.y)
    const to = clipFromRectCenter(toR, fromC.x, fromC.y)
    return { id: l.id, from, to, link: l }
  }).filter(Boolean) as Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; link: Link }>
})

function linkDragFromPoint(): { x: number; y: number } {
  if (!linkStart.value) return { x: 0, y: 0 }
  const r = nodeRect(linkStart.value.type, linkStart.value.id)
  if (!r) return { x: linkStart.value.mouseX, y: linkStart.value.mouseY }
  return clipFromRectCenter(r, linkStart.value.mouseX, linkStart.value.mouseY)
}

function drawingPath(points: string): string {
  try {
    const pts = JSON.parse(points) as number[][]
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]! + 10000} ${p[1]! + 10000}`).join(' ')
  } catch { return '' }
}
function penPath(points: number[][]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]! + 10000} ${p[1]! + 10000}`).join(' ')
}

function isDone(t: Task) { return t.status === 'completed' }
function userInitial(name: string | null | undefined) { return name?.charAt(0) ?? '?' }
function zoomIn() { const r = canvasEl.value?.getBoundingClientRect(); if (r) zoomBy(1.2, r.width / 2, r.height / 2) }
function zoomOut() { const r = canvasEl.value?.getBoundingClientRect(); if (r) zoomBy(1 / 1.2, r.width / 2, r.height / 2) }

const cursorStyle = computed(() => {
  if (tool.value === 'select') return 'default'
  if (tool.value === 'eraser') return 'not-allowed'
  return 'crosshair'
})

function backToGroupAtlas() { router.push(`/${groupSlug.value}/atlas`) }

// タスクカードの style 計算（複数選択ドラッグ追従対応）
function taskStyle(n: TaskNode): Record<string, string | number> {
  if (drag.value?.kind === 'task' && drag.value.id === n.task.id) {
    return {
      left: drag.value.x + 'px', top: drag.value.y + 'px',
      width: TASK_W + 'px', height: TASK_H + 'px',
      zIndex: 100, transform: 'scale(1.04)', opacity: 0.9, cursor: 'move',
    }
  }
  const otherDrag = multiDrag.value?.others.find(o => o.taskId === n.task.id)
  if (otherDrag) {
    return {
      left: otherDrag.currentX + 'px', top: otherDrag.currentY + 'px',
      width: TASK_W + 'px', height: TASK_H + 'px',
      zIndex: 100, opacity: 0.85, cursor: 'move',
    }
  }
  return {
    left: n.x + 'px', top: n.y + 'px',
    width: TASK_W + 'px', height: TASK_H + 'px',
    zIndex: n.parentSectionId ? 10 : 5,
    cursor: tool.value === 'eraser' ? 'not-allowed'
      : tool.value === 'link' ? 'crosshair'
      : tool.value === 'select' ? 'move' : 'default',
  }
}

// === ツールバーからドラッグして配置 ===
function onToolbarDragStart(t: AtlasTool, _startEvent: MouseEvent) {
  armedTool.value = t
  ghostCursor.value.visible = true
  document.addEventListener('mousemove', onArmedMove)
  document.addEventListener('mouseup', onArmedUp)
  document.addEventListener('keydown', onArmedKey)
}

function onArmedMove(e: MouseEvent) {
  ghostCursor.value.x = e.clientX
  ghostCursor.value.y = e.clientY
  ghostCursor.value.visible = true
}

async function onArmedUp(e: MouseEvent) {
  const wasArmed = armedTool.value
  cleanupArmed()
  if (!wasArmed || !canvasEl.value || !project.value) return
  // ツールバー上で離した場合は無視
  const target = e.target as HTMLElement
  if (target.closest('.atlas-toolbar')) return
  const rect = canvasEl.value.getBoundingClientRect()
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
  const w = toWorld(e.clientX, e.clientY, rect)
  if (wasArmed === 'task') {
    const section = findSectionAt(w.x, w.y)
    inlineCreate.value = {
      kind: 'task',
      x: w.x - TASK_W / 2, y: w.y - TASK_H / 2,
      parentSectionId: section?.task.id ?? null,
      title: '',
    }
    nextTick(() => focusInlineCreateInput())
  } else if (wasArmed === 'section') {
    const t = avoidHeaderCollision(w.x - SECTION_W / 2, w.y - 30)
    inlineCreate.value = { kind: 'section', x: t.x, y: t.y, title: '' }
    nextTick(() => focusInlineCreateInput())
  } else if (wasArmed === 'message') {
    if (!groupsStore.currentGroup?.id) return
    const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/annotations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.value.id, text: '', x: w.x - 100, y: w.y - 50,
        width: 200, height: 100, color: Math.floor(Math.random() * 6),
      }),
    })
    if (res.ok) { const ann = await res.json(); annotations.value.push(ann); startEditAnnotation(ann) }
  }
}

function onArmedKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cleanupArmed()
}

function cleanupArmed() {
  armedTool.value = null
  ghostCursor.value.visible = false
  document.removeEventListener('mousemove', onArmedMove)
  document.removeEventListener('mouseup', onArmedUp)
  document.removeEventListener('keydown', onArmedKey)
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-160px)] relative">
    <div class="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30">
      <button
        v-if="!project?.is_personal"
        class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        @click="backToGroupAtlas"
      >← アトラス</button>
      <button
        v-else
        class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        @click="$router.push('/my/inbox')"
      >← インボックス</button>
      <span class="text-muted-foreground">/</span>
      <template v-if="project?.is_personal">
        <span class="text-base">📥</span>
        <h1 class="text-lg font-bold">インボックス（ふせん）</h1>
      </template>
      <template v-else>
        <span class="text-base">{{ project?.icon || '📁' }}</span>
        <h1 class="text-lg font-bold">{{ project?.name || 'プロジェクト' }}</h1>
      </template>
    </div>

    <div
      ref="canvasEl"
      class="atlas-canvas relative flex-1 overflow-hidden select-none"
      :style="{ cursor: cursorStyle, backgroundColor: '#FBF9F2', backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }"
      @mousedown="onCanvasMouseDown"
      @contextmenu="onCanvasContextMenu"
    >
      <div class="zoom-controls absolute top-3 right-3 z-50 flex items-center gap-1 bg-card border border-border rounded-md shadow-sm p-1">
        <button
          class="text-xs px-2 py-1 hover:bg-muted rounded flex items-center gap-1"
          :class="hideCompleted ? 'text-muted-foreground' : 'text-success'"
          @click="hideCompleted = !hideCompleted"
          :title="hideCompleted ? '完了を表示' : '完了を隠す'"
        >
          <span>{{ hideCompleted ? '☐' : '✓' }}</span>
          <span>完了</span>
        </button>
        <span class="w-px h-5 bg-border mx-0.5"></span>
        <button class="w-7 h-7 flex items-center justify-center hover:bg-muted rounded" @click="zoomOut">−</button>
        <span class="text-xs text-muted-foreground w-12 text-center">{{ Math.round(scale * 100) }}%</span>
        <button class="w-7 h-7 flex items-center justify-center hover:bg-muted rounded" @click="zoomIn">＋</button>
        <button class="text-xs px-2 hover:bg-muted rounded" @click="fitAll" title="全体表示">⤢</button>
        <button class="text-xs px-2 hover:bg-muted rounded" @click="reset" title="100%">⟲</button>
      </div>

      <div class="absolute top-3 left-3 z-40 px-3 py-1.5 bg-card border border-border rounded-md text-xs text-muted-foreground pointer-events-none">
        <span v-if="tool === 'select'">クリックで選択 / 空白ドラッグで矩形選択 / 右クリックでメニュー / V T S M L P E でツール切替</span>
        <span v-else-if="tool === 'task'">空白クリックで新規タスク（タイトルを直接入力、Esc で取消）</span>
        <span v-else-if="tool === 'section'">空白クリックで新規セクション（タイトルを直接入力、Esc で取消）</span>
        <span v-else-if="tool === 'message'">空白クリックでメッセージ追加</span>
        <span v-else-if="tool === 'link'">2つのノードをクリックで繋ぐ</span>
        <span v-else-if="tool === 'pen'">ドラッグで線を描く</span>
        <span v-else-if="tool === 'eraser'">削除したいものをクリック</span>
      </div>

      <div
        class="absolute top-0 left-0"
        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: '0 0' }"
      >
        <!-- 描画レイヤー: ペン/消しゴム時は前面に持ち上がる -->
        <svg
          class="absolute pointer-events-none atlas-drawing-layer"
          :style="{
            left: '-10000px', top: '-10000px',
            width: '20000px', height: '20000px',
            zIndex: (tool === 'pen' || tool === 'eraser') ? 55 : 1,
          }"
        >
          <defs>
            <marker id="atlas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
            </marker>
          </defs>
          <g v-for="d in drawings" :key="d.id" class="atlas-drawing">
            <!-- 視覚 stroke -->
            <path
              :d="drawingPath(d.points)"
              :stroke="d.color" :stroke-width="d.stroke_width"
              fill="none" stroke-linecap="round" stroke-linejoin="round"
              class="atlas-drawing-visible pointer-events-none"
            />
            <!-- 太い hit area（消しゴム用に当たり判定を広く） -->
            <path
              :d="drawingPath(d.points)"
              stroke="transparent" stroke-width="18"
              fill="none" stroke-linecap="round" stroke-linejoin="round"
              class="atlas-drawing-hit pointer-events-auto"
              :style="{ cursor: tool === 'eraser' ? 'not-allowed' : 'default' }"
              @click="tool === 'eraser' && deleteDrawing(d)"
            />
          </g>
          <path
            v-if="drag?.kind === 'pen'"
            :d="penPath(drag.points)"
            stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>

        <!-- セクション領域（背景） -->
        <div
          v-for="sec in layoutData.sections"
          :key="`sec-bg-${sec.task.id}`"
          data-node="section"
          :data-section-id="sec.task.id"
          class="absolute rounded-2xl border-2 transition-colors"
          :class="[
            dragHoverSectionId === sec.task.id ? 'bg-info/15 border-solid' : 'bg-info/5 border-dashed',
            isSelected('section', sec.task.id) ? 'ring-2 ring-info ring-offset-1' : '',
          ]"
          :style="{
            left: sec.x + 'px', top: sec.y + 'px',
            width: sec.w + 'px', height: sec.h + 'px',
            borderColor: dragHoverSectionId === sec.task.id ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.35)',
            cursor: tool === 'select' ? 'move' : tool === 'eraser' ? 'not-allowed' : tool === 'link' ? 'crosshair' : 'default',
            zIndex: 2,
          }"
          @mousedown="onSectionHeaderMouseDown($event, sec)"
        >
          <div
            class="px-3 py-2 flex items-center gap-2 select-none"
            :style="{ height: SECTION_HEADER_H + 'px', cursor: tool === 'select' ? 'move' : 'default' }"
            @mousedown="onSectionHeaderMouseDown($event, sec)"
          >
            <span>🗂️</span>
            <span
              v-if="editingSectionId !== sec.task.id"
              class="text-sm font-semibold flex-1 truncate"
              @dblclick.stop="startEditSectionTitle(sec)"
              title="ダブルクリックで編集"
            >{{ sec.task.title }}</span>
            <span v-else class="atlas-section-title-edit flex-1" @mousedown.stop>
              <input
                v-model="editSectionTitle"
                class="w-full text-sm font-semibold bg-card border border-info rounded px-1 py-0.5 outline-none"
                @blur="commitSectionTitle"
                @keydown.enter.prevent="commitSectionTitle"
                @keydown.esc.prevent="editingSectionId = null"
              />
            </span>
            <span class="text-xs text-muted-foreground">
              {{ sec.childTasks.length }}<span v-if="sec.allChildren.length !== sec.childTasks.length" class="opacity-50">/{{ sec.allChildren.length }}</span>
            </span>
            <!-- 列数調整 -->
            <div class="flex items-center gap-0.5 ml-1" @mousedown.stop>
              <button
                class="text-xs px-1 hover:bg-info/20 rounded"
                title="列を減らす"
                @click.stop="changeSectionColumns(sec, sec.cols - 1)"
              >−</button>
              <span class="text-xs text-muted-foreground w-4 text-center">{{ sec.cols }}</span>
              <button
                class="text-xs px-1 hover:bg-info/20 rounded"
                title="列を増やす"
                @click.stop="changeSectionColumns(sec, sec.cols + 1)"
              >+</button>
            </div>
          </div>
          <!-- 右下リサイズハンドル（X:列数 / Y:高さ） -->
          <div
            v-if="tool === 'select'"
            class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            :style="{ background: 'linear-gradient(135deg, transparent 50%, rgba(99,102,241,0.6) 50%)' }"
            @mousedown.stop="onSectionResizeMouseDown($event, sec)"
            title="ドラッグでサイズ変更（→列数 / ↓高さ）"
          ></div>
        </div>

        <!-- 全タスク（loose も子も同じレンダリング、自由配置） -->
        <div
          v-for="n in layoutData.taskNodes"
          :key="n.task.id"
          data-node="task"
          :data-task-id="n.task.id"
          class="absolute rounded-md shadow-sm bg-card border border-border p-2"
          :class="isSelected('task', n.task.id) ? 'ring-2 ring-info ring-offset-1' : ''"
          :style="taskStyle(n)"
          @mousedown="onTaskMouseDown($event, n.task, n.x, n.y)"
          @click.stop="toggleSelect('task', n.task.id, $event.shiftKey)"
          @dblclick.stop="openTask(n.task)"
        >
          <div class="flex items-center gap-1 mb-1">
            <button
              class="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
              :class="isDone(n.task) ? 'bg-success border-success' : 'border-input'"
              @click.stop="toggleStatus(n.task)"
            >
              <svg v-if="isDone(n.task)" class="w-2 h-2 text-success-foreground" viewBox="0 0 12 12" fill="none">
                <path d="M2 6 L5 9 L10 3" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>
            <span class="text-xs text-muted-foreground">#{{ n.task.task_number }}</span>
            <span
              v-if="n.subtaskCount > 0"
              class="ml-auto text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded-sm flex items-center gap-0.5"
              :title="`${n.subtaskCount} 件のサブタスク（タスク詳細で確認）`"
            >
              <span>↳</span>
              <span>{{ n.subtaskCount }}</span>
            </span>
          </div>
          <div class="text-xs leading-tight line-clamp-3" :class="{ 'line-through opacity-60': isDone(n.task) }">
            {{ n.task.title }}
          </div>
          <div v-if="n.task.assignee_name" class="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-info/15 text-info text-xs flex items-center justify-center font-medium" :title="n.task.assignee_name">
            {{ userInitial(n.task.assignee_name) }}
          </div>
        </div>

        <!-- リンク線（前面） -->
        <svg class="absolute pointer-events-none" style="left: -10000px; top: -10000px; width: 20000px; height: 20000px; z-index: 50;">
          <defs>
            <marker id="atlas-arrow2" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
            </marker>
          </defs>
          <g v-for="ln in linkLines" :key="ln.id">
            <line
              :x1="ln.from.x + 10000" :y1="ln.from.y + 10000"
              :x2="ln.to.x + 10000" :y2="ln.to.y + 10000"
              stroke="#6366f1" stroke-width="2" marker-end="url(#atlas-arrow2)"
              class="pointer-events-auto" style="cursor: pointer;"
              @click="deleteLink(ln.link)"
            />
          </g>
          <line
            v-if="linkStart"
            :x1="linkDragFromPoint().x + 10000"
            :y1="linkDragFromPoint().y + 10000"
            :x2="linkStart.mouseX + 10000" :y2="linkStart.mouseY + 10000"
            stroke="#6366f1" stroke-width="2" stroke-dasharray="4 4"
          />
        </svg>

        <!-- 注釈 -->
        <div
          v-for="ann in annotations"
          :key="ann.id"
          data-node="annotation"
          :data-annotation-id="ann.id"
          class="absolute rounded-md shadow-md"
          :class="isSelected('annotation', ann.id) ? 'ring-2 ring-info ring-offset-1' : ''"
          :style="{
            left: ann.x + 'px', top: ann.y + 'px',
            width: ann.width + 'px', height: ann.height + 'px',
            background: ANNOTATION_COLORS[ann.color]?.bg || ANNOTATION_COLORS[0]!.bg,
            borderLeft: '4px solid ' + (ANNOTATION_COLORS[ann.color]?.border || ANNOTATION_COLORS[0]!.border),
            transform: `rotate(${ann.rotation}deg)`,
            zIndex: editingAnnotationId === ann.id ? 200 : 30,
            cursor: tool === 'eraser' ? 'not-allowed' : tool === 'link' ? 'crosshair' : tool === 'select' ? 'move' : 'default',
          }"
          @mousedown="onAnnotationMouseDown($event, ann)"
          @click.stop="toggleSelect('annotation', ann.id, $event.shiftKey)"
          @dblclick.stop="startEditAnnotation(ann)"
        >
          <textarea
            v-if="editingAnnotationId === ann.id"
            v-model="editAnnotationText"
            class="annotation-edit w-full h-full p-2 text-sm bg-transparent resize-none outline-none"
            @blur="saveAnnotation"
            @keydown.esc="editingAnnotationId = null"
          />
          <div v-else class="p-2 text-sm whitespace-pre-wrap h-full overflow-hidden">
            {{ ann.text || '(ダブルクリックで編集)' }}
          </div>
          <div class="absolute bottom-1 right-1 flex items-center gap-1 opacity-60 hover:opacity-100">
            <button class="text-xs" @click.stop="cycleAnnotationColor(ann)">🎨</button>
            <button class="text-xs" @click.stop="deleteAnnotation(ann)">×</button>
          </div>
        </div>

        <!-- snap guides -->
        <svg
          v-if="snapGuides.vertical.length > 0 || snapGuides.horizontal.length > 0"
          class="absolute pointer-events-none"
          style="left: -10000px; top: -10000px; width: 20000px; height: 20000px; z-index: 60;"
        >
          <line
            v-for="(x, i) in snapGuides.vertical" :key="`v-${i}`"
            :x1="x + 10000" :y1="0" :x2="x + 10000" :y2="20000"
            stroke="#ef4444" stroke-width="1" stroke-dasharray="3 3"
          />
          <line
            v-for="(y, i) in snapGuides.horizontal" :key="`h-${i}`"
            :x1="0" :y1="y + 10000" :x2="20000" :y2="y + 10000"
            stroke="#ef4444" stroke-width="1" stroke-dasharray="3 3"
          />
        </svg>

        <!-- box select 矩形 -->
        <div
          v-if="boxSelect"
          class="absolute pointer-events-none border-2 border-info bg-info/10 rounded-sm"
          :style="{
            left: Math.min(boxSelect.startX, boxSelect.x) + 'px',
            top: Math.min(boxSelect.startY, boxSelect.y) + 'px',
            width: Math.abs(boxSelect.x - boxSelect.startX) + 'px',
            height: Math.abs(boxSelect.y - boxSelect.startY) + 'px',
            zIndex: 70,
          }"
        ></div>

        <!-- インライン作成カード（タスク / セクション） -->
        <div
          v-if="inlineCreate"
          class="atlas-inline-create absolute"
          :style="inlineCreate.kind === 'task'
            ? { left: inlineCreate.x + 'px', top: inlineCreate.y + 'px', width: TASK_W + 'px', height: TASK_H + 'px', zIndex: 150 }
            : { left: inlineCreate.x + 'px', top: inlineCreate.y + 'px', width: SECTION_W + 'px', zIndex: 150 }"
          @mousedown.stop
          @contextmenu.stop
        >
          <div v-if="inlineCreate.kind === 'task'" class="rounded-md shadow-lg bg-card border-2 border-info p-2 h-full">
            <input
              v-model="inlineCreate.title"
              placeholder="タスク名"
              class="w-full bg-transparent text-xs leading-tight outline-none"
              @keydown.enter.prevent="commitInlineCreate"
              @keydown.esc.prevent="cancelInlineCreate"
              @blur="commitInlineCreate"
            />
          </div>
          <div v-else class="rounded-2xl border-2 border-info bg-info/10 px-3 py-2">
            <input
              v-model="inlineCreate.title"
              placeholder="セクション名"
              class="w-full bg-transparent text-sm font-semibold outline-none"
              @keydown.enter.prevent="commitInlineCreate"
              @keydown.esc.prevent="cancelInlineCreate"
              @blur="commitInlineCreate"
            />
          </div>
        </div>

        <div v-if="layoutData.sections.length === 0 && layoutData.taskNodes.length === 0 && annotations.length === 0 && !inlineCreate" class="absolute top-20 left-20 text-muted-foreground text-sm pointer-events-none">
          下のツールバーで「🗂️ セクション」「☐ タスク」を選ぶ / 右クリックで素早く追加
        </div>
      </div>

      <!-- コンテキストメニュー（fixed: ビューポート座標） -->
      <div
        v-if="contextMenu"
        class="atlas-context-menu fixed bg-card border border-border rounded-md shadow-lg py-1 z-[100] min-w-[180px] text-sm"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
        @mousedown.stop
      >
        <template v-if="contextMenu.mode === 'pane'">
          <button class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" @click="ctxAddTaskHere">
            <span>☐</span><span>ここにタスクを追加</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" @click="ctxAddSectionHere">
            <span>🗂️</span><span>ここにセクションを追加</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" @click="ctxAddMessageHere">
            <span>📝</span><span>ここにメッセージを追加</span>
          </button>
        </template>
        <template v-else>
          <button class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" @click="ctxStartLink">
            <span>🔗</span><span>ここからリンクを引く</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-destructive" @click="ctxDelete">
            <span>🗑️</span><span>削除</span>
          </button>
        </template>
      </div>

      <!-- コンテキストメニュー閉じる用の不可視オーバーレイ -->
      <div v-if="contextMenu" class="fixed inset-0 z-[99]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    </div>

    <AtlasToolbar
      v-model="tool"
      :tools="availableTools"
      :armed-tool="armedTool"
      @tool-drag-start="onToolbarDragStart"
    />

    <!-- ゴーストカーソル（armed 状態時に表示） -->
    <div
      v-if="ghostCursor.visible && armedTool"
      class="fixed pointer-events-none z-[200] text-2xl"
      :style="{ left: ghostCursor.x + 'px', top: ghostCursor.y + 'px', transform: 'translate(-50%, -50%)' }"
    >
      <span v-if="armedTool === 'task'">☐</span>
      <span v-else-if="armedTool === 'section'">🗂️</span>
      <span v-else-if="armedTool === 'message'">📝</span>
    </div>
  </div>
</template>

<style scoped>
/* 消しゴムツールがアクティブな時、描画レイヤー要素をホバーで赤く */
.atlas-drawing-hit:hover + .atlas-drawing-visible,
.atlas-drawing:has(.atlas-drawing-hit:hover) .atlas-drawing-visible {
  stroke: #ef4444 !important;
  stroke-width: 4 !important;
}
</style>
