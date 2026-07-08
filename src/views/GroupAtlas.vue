<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useZoomPan } from '@/composables/useZoomPan'
import AtlasToolbar, { type AtlasTool } from '@/components/atlas/AtlasToolbar.vue'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const canvasEl = ref<HTMLDivElement | null>(null)

const { scale, panX, panY, isPanning, setupHandlers, cleanup, reset, zoomBy, toWorld, fitTo } = useZoomPan({
  minScale: 0.2, maxScale: 4,
})
onMounted(() => setupHandlers(canvasEl.value))
onBeforeUnmount(cleanup)

let didInitialFit = false
function fitAll() {
  const items: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const c of projectCards.value) {
    items.push({ x: c.x, y: c.y, w: PROJECT_CARD_W, h: PROJECT_CARD_H })
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
const availableTools: AtlasTool[] = ['select', 'project', 'message', 'link', 'pen', 'eraser']

interface Annotation {
  id: string; text: string; x: number; y: number; width: number; height: number; color: number; rotation: number
}
interface Link {
  id: string; from_type: string; from_id: string; to_type: string; to_id: string; kind: string
}
interface LayoutEntry {
  node_type: string; node_id: string; x: number; y: number; width: number | null; height: number | null
}
interface Drawing {
  id: string; points: string; color: string; stroke_width: number
}

const annotations = ref<Annotation[]>([])
const links = ref<Link[]>([])
const layout = ref<Map<string, LayoutEntry>>(new Map())
const drawings = ref<Drawing[]>([])

const editingAnnotationId = ref<string | null>(null)
const editAnnotationText = ref('')

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
  if (!groupsStore.currentGroup?.id) return
  const gid = groupsStore.currentGroup.id
  await Promise.all([
    projectsStore.fetchGroupProjects(gid),
    tasksStore.fetchGroupTasks(gid),
  ])
  const r = await api(`/api/atlas/groups/${gid}`)
  if (r.ok) {
    const data = await r.json()
    annotations.value = data.annotations
    links.value = data.links
    drawings.value = data.drawings
    layout.value = new Map((data.layout as LayoutEntry[]).map(e => [`${e.node_type}:${e.node_id}`, e]))
  }
  // 初回ロード時のみ全体に合わせる
  if (!didInitialFit) {
    didInitialFit = true
    setTimeout(() => fitAll(), 50)
  }
}
onMounted(load)
watch(groupSlug, () => { didInitialFit = false; load() })

async function saveLayout(nodeType: string, nodeId: string, x: number, y: number, w?: number, h?: number) {
  if (!groupsStore.currentGroup?.id) return
  layout.value.set(`${nodeType}:${nodeId}`, {
    node_type: nodeType, node_id: nodeId, x, y, width: w ?? null, height: h ?? null,
  })
  layout.value = new Map(layout.value)
  await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/layout/${nodeType}/${nodeId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, width: w, height: h, project_id: null }),
  })
}

// === プロジェクトカード ===
const PROJECT_CARD_W = 260
const PROJECT_CARD_H = 220

interface ProjectCard {
  id: string; name: string; icon: string | null; color: string | null; slug: string
  taskCount: number
  sections: { id: string; title: string; childCount: number }[]
  hasUnsorted: boolean  // セクション外のタスクがあるか
  lastUpdated: { title: string; status: string; updatedAt: string } | null
  x: number; y: number
}

function formatRelative(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  const diff = (Date.now() - d.getTime()) / 60000
  if (diff < 1) return 'たった今'
  if (diff < 60) return `${Math.floor(diff)}分前`
  if (diff < 1440) return `${Math.floor(diff / 60)}時間前`
  if (diff < 1440 * 7) return `${Math.floor(diff / 1440)}日前`
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

const projectCards = computed<ProjectCard[]>(() => {
  const projs = projectsStore.projects.filter(p => !p.is_personal)
  let autoX = 80, autoY = 80
  const cardsPerRow = 4
  return projs.map((p, i) => {
    const projTasks = tasksStore.tasks.filter(t => t.project_id === p.id)
    const childCountMap = new Map<string, number>()
    for (const t of projTasks) {
      if (t.parent_task_id) {
        childCountMap.set(t.parent_task_id, (childCountMap.get(t.parent_task_id) ?? 0) + 1)
      }
    }
    const sections = projTasks
      .filter(t => childCountMap.has(t.id))
      .map(t => ({ id: t.id, title: t.title, childCount: childCountMap.get(t.id) ?? 0 }))
    const hasUnsorted = projTasks.some(t => !t.parent_task_id && !childCountMap.has(t.id))

    // 最終更新タスク
    const sorted = [...projTasks].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    const lastUpdated = sorted[0]
      ? { title: sorted[0].title, status: sorted[0].status, updatedAt: sorted[0].updated_at }
      : null

    const saved = layout.value.get(`project:${p.id}`)
    const x = saved ? saved.x : autoX + (i % cardsPerRow) * (PROJECT_CARD_W + 40)
    const y = saved ? saved.y : autoY + Math.floor(i / cardsPerRow) * (PROJECT_CARD_H + 40)
    return {
      id: p.id, name: p.name, icon: p.icon, color: p.color, slug: p.slug,
      taskCount: projTasks.length, sections, hasUnsorted, lastUpdated,
      x, y,
    }
  })
})

interface Rect { x: number; y: number; w: number; h: number }

function nodeRect(type: string, id: string): Rect | null {
  if (type === 'project') {
    const c = projectCards.value.find(p => p.id === id)
    if (c) return { x: c.x, y: c.y, w: PROJECT_CARD_W, h: PROJECT_CARD_H }
  }
  if (type === 'annotation') {
    const a = annotations.value.find(x => x.id === id)
    if (a) return { x: a.x, y: a.y, w: a.width, h: a.height }
  }
  return null
}

// 矩形中心から指定方向へ進んで矩形の辺で止まる点
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

// === ドラッグ状態 ===
type Drag =
  | { kind: 'project'; id: string; offsetX: number; offsetY: number; x: number; y: number }
  | { kind: 'annotation'; id: string; offsetX: number; offsetY: number }
  | { kind: 'pen'; points: number[][] }

const drag = ref<Drag | null>(null)
const linkStart = ref<{ type: string; id: string; mouseX: number; mouseY: number } | null>(null)

function onWindowKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    tool.value = 'select'
    linkStart.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))

// === キャンバス操作 ===
async function onCanvasMouseDown(e: MouseEvent) {
  if (e.button !== 0 || isPanning.value) return
  const target = e.target as HTMLElement
  if (target.closest('.atlas-toolbar') || target.closest('.zoom-controls')) return
  // select/link/eraser のときはオブジェクト上で何もしない（オブジェクト側が処理する）
  const onNode = target.closest('[data-node]')
  if (onNode && (tool.value === 'select' || tool.value === 'link' || tool.value === 'eraser')) return
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())

  if (tool.value === 'project') {
    const name = prompt('プロジェクト名')
    if (!name || !groupsStore.currentGroup?.id || !userStore.currentUser?.id) { tool.value = 'select'; return }
    const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-') || `proj-${Date.now()}`
    const proj = await projectsStore.createProject({
      group_id: groupsStore.currentGroup.id, name, slug,
      created_by: userStore.currentUser.id,
    })
    await saveLayout('project', proj.id, w.x - PROJECT_CARD_W / 2, w.y - PROJECT_CARD_H / 2)
    await projectsStore.fetchGroupProjects(groupsStore.currentGroup.id)
    tool.value = 'select'
  } else if (tool.value === 'message') {
    if (!groupsStore.currentGroup?.id) return
    const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/annotations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: null,
        text: '', x: w.x - 100, y: w.y - 50,
        width: 200, height: 100, color: Math.floor(Math.random() * 6),
      }),
    })
    if (res.ok) {
      const ann = await res.json()
      annotations.value.push(ann)
      startEditAnnotation(ann)
    }
    tool.value = 'select'
  } else if (tool.value === 'link') {
    linkStart.value = null  // 空白クリックでキャンセル
  } else if (tool.value === 'pen') {
    drag.value = { kind: 'pen', points: [[w.x, w.y]] }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
}

// === プロジェクトカード ===
function onProjectCardMouseDown(e: MouseEvent, card: ProjectCard) {
  if (e.button !== 0 || isPanning.value) return
  if ((e.target as HTMLElement).closest('button')) return

  if (tool.value === 'eraser') {
    e.stopPropagation()
    if (confirm(`プロジェクト「${card.name}」を削除？タスクも全部消えます`)) {
      deleteProjectCard(card)
    }
    return
  }
  if (tool.value === 'link') {
    e.stopPropagation()
    handleLinkClick('project', card.id, e)
    return
  }
  // select 以外（project/message/pen 等）はオブジェクトに触っても無視 → キャンバスに任せる
  if (tool.value !== 'select') return

  e.stopPropagation()
  if (!canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  drag.value = { kind: 'project', id: card.id, offsetX: w.x - card.x, offsetY: w.y - card.y, x: card.x, y: card.y }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onProjectCardDblClick(e: MouseEvent, card: ProjectCard) {
  if (tool.value !== 'select') return
  e.stopPropagation()
  // プロジェクト内へドリルダウン
  router.push(`/${groupSlug.value}/atlas/${card.slug}`)
}

async function deleteProjectCard(card: ProjectCard) {
  await projectsStore.deleteProject(card.id)
  if (groupsStore.currentGroup?.id) {
    await projectsStore.fetchGroupProjects(groupsStore.currentGroup.id)
    await tasksStore.fetchGroupTasks(groupsStore.currentGroup.id)
  }
}

// === 注釈 ===
function onAnnotationMouseDown(e: MouseEvent, ann: Annotation) {
  if (e.button !== 0 || isPanning.value) return
  if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('textarea')) return

  if (tool.value === 'eraser') {
    e.stopPropagation()
    deleteAnnotation(ann)
    return
  }
  if (tool.value === 'link') {
    e.stopPropagation()
    handleLinkClick('annotation', ann.id, e)
    return
  }
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

// === 移動 ===
function onMouseMove(e: MouseEvent) {
  if (!drag.value || !canvasEl.value) return
  const w = toWorld(e.clientX, e.clientY, canvasEl.value.getBoundingClientRect())
  if (drag.value.kind === 'project') {
    drag.value.x = w.x - drag.value.offsetX
    drag.value.y = w.y - drag.value.offsetY
  } else if (drag.value.kind === 'annotation') {
    const ann = annotations.value.find(a => a.id === (drag.value as any).id)
    if (ann) {
      ann.x = w.x - drag.value.offsetX
      ann.y = w.y - drag.value.offsetY
    }
  } else if (drag.value.kind === 'pen') {
    drag.value.points.push([w.x, w.y])
  }
}

async function onMouseUp(_e: MouseEvent) {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  if (!drag.value) return
  const d = drag.value
  drag.value = null

  if (d.kind === 'project') {
    await saveLayout('project', d.id, d.x, d.y)
  } else if (d.kind === 'annotation') {
    const ann = annotations.value.find(a => a.id === d.id)
    if (ann) {
      await api(`/api/atlas/annotations/${ann.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: ann.x, y: ann.y }),
      })
    }
  } else if (d.kind === 'pen') {
    if (d.points.length >= 2 && groupsStore.currentGroup?.id) {
      const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/drawings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: null, points: d.points, color: '#1f2937', stroke_width: 2 }),
      })
      if (res.ok) drawings.value.push(await res.json())
    }
  }
}

// === リンク ===
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
  if (!groupsStore.currentGroup?.id) return
  const res = await api(`/api/atlas/groups/${groupsStore.currentGroup.id}/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: null, from_type: fromType, from_id: fromId, to_type: toType, to_id: toId, kind: 'relates' }),
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

// === 描画用 ===
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

function zoomIn() {
  const r = canvasEl.value?.getBoundingClientRect()
  if (r) zoomBy(1.2, r.width / 2, r.height / 2)
}
function zoomOut() {
  const r = canvasEl.value?.getBoundingClientRect()
  if (r) zoomBy(1 / 1.2, r.width / 2, r.height / 2)
}

const cursorStyle = computed(() => {
  if (tool.value === 'select') return 'default'
  if (tool.value === 'eraser') return 'not-allowed'
  if (tool.value === 'pen') return 'crosshair'
  if (tool.value === 'link') return 'crosshair'
  return 'crosshair'
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-160px)] relative">
    <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold">🗺️ アトラス</h1>
        <span class="text-xs text-muted-foreground">プロジェクトボード - クリックで中に入る</span>
      </div>
    </div>

    <div
      ref="canvasEl"
      class="atlas-canvas relative flex-1 overflow-hidden select-none"
      :style="{ cursor: cursorStyle, backgroundColor: '#FBF9F2', backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }"
      @mousedown="onCanvasMouseDown"
    >
      <!-- ズームコントロール -->
      <div class="zoom-controls absolute top-3 right-3 z-50 flex items-center gap-1 bg-card border border-border rounded-md shadow-sm p-1">
        <button class="w-7 h-7 flex items-center justify-center hover:bg-muted rounded" @click="zoomOut">−</button>
        <span class="text-xs text-muted-foreground w-12 text-center">{{ Math.round(scale * 100) }}%</span>
        <button class="w-7 h-7 flex items-center justify-center hover:bg-muted rounded" @click="zoomIn">＋</button>
        <button class="text-xs px-2 hover:bg-muted rounded" @click="fitAll" title="全体表示">⤢</button>
        <button class="text-xs px-2 hover:bg-muted rounded" @click="reset" title="100%">⟲</button>
      </div>

      <!-- ステータスヒント -->
      <div class="absolute top-3 left-3 z-40 px-3 py-1.5 bg-card border border-border rounded-md text-xs text-muted-foreground pointer-events-none">
        <span v-if="tool === 'select'">プロジェクトをダブルクリックで中に入る / シングルクリック+ドラッグで配置</span>
        <span v-else-if="tool === 'project'">空白クリックでプロジェクト追加</span>
        <span v-else-if="tool === 'message'">空白クリックでメッセージ追加</span>
        <span v-else-if="tool === 'link'">2つのノードをクリックして繋ぐ（ESCでキャンセル）</span>
        <span v-else-if="tool === 'pen'">ドラッグで線を描く</span>
        <span v-else-if="tool === 'eraser'">削除したいものをクリック</span>
      </div>

      <!-- 変換コンテナ -->
      <div
        class="absolute top-0 left-0"
        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: '0 0' }"
      >
        <!-- リンク + 描画 SVG -->
        <svg
          class="absolute pointer-events-none"
          style="left: -10000px; top: -10000px; width: 20000px; height: 20000px;"
        >
          <defs>
            <marker id="atlas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
            </marker>
          </defs>
          <!-- ペン描画 -->
          <path
            v-for="d in drawings" :key="d.id"
            :d="drawingPath(d.points)"
            :stroke="d.color" :stroke-width="d.stroke_width"
            fill="none" stroke-linecap="round" stroke-linejoin="round"
            class="pointer-events-auto"
            :style="{ cursor: tool === 'eraser' ? 'not-allowed' : 'default' }"
            @click="tool === 'eraser' && deleteDrawing(d)"
          />
          <!-- 描画中のペン -->
          <path
            v-if="drag?.kind === 'pen'"
            :d="penPath(drag.points)"
            stroke="#1f2937" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round"
          />
          <!-- リンク線 -->
          <g v-for="ln in linkLines" :key="ln.id">
            <line
              :x1="ln.from.x + 10000" :y1="ln.from.y + 10000"
              :x2="ln.to.x + 10000" :y2="ln.to.y + 10000"
              stroke="#6366f1" stroke-width="2"
              marker-end="url(#atlas-arrow)"
              class="pointer-events-auto" style="cursor: pointer;"
              @click="deleteLink(ln.link)"
            />
          </g>
          <!-- 描画中のリンク -->
          <line
            v-if="linkStart"
            :x1="linkDragFromPoint().x + 10000"
            :y1="linkDragFromPoint().y + 10000"
            :x2="linkStart.mouseX + 10000"
            :y2="linkStart.mouseY + 10000"
            stroke="#6366f1" stroke-width="2" stroke-dasharray="4 4"
          />
        </svg>

        <!-- プロジェクトカード -->
        <div
          v-for="card in projectCards"
          :key="card.id"
          data-node="project"
          class="absolute rounded-xl border-2 bg-card transition-all hover:shadow-xl"
          :style="drag?.kind === 'project' && drag.id === card.id
            ? { left: drag.x + 'px', top: drag.y + 'px', width: PROJECT_CARD_W + 'px', height: PROJECT_CARD_H + 'px',
                borderColor: card.color || '#6366f1', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, cursor: 'grabbing' }
            : { left: card.x + 'px', top: card.y + 'px', width: PROJECT_CARD_W + 'px', height: PROJECT_CARD_H + 'px',
                borderColor: card.color || '#cbd5e1',
                cursor: tool === 'select' ? 'pointer' : tool === 'eraser' ? 'not-allowed' : 'crosshair',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }"
          @mousedown="onProjectCardMouseDown($event, card)"
          @dblclick="onProjectCardDblClick($event, card)"
        >
          <div class="p-3 h-full flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span class="text-2xl shrink-0">{{ card.icon || '📁' }}</span>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-bold truncate">{{ card.name }}</h3>
                <p class="text-xs text-muted-foreground">{{ card.taskCount }} タスク</p>
              </div>
            </div>

            <!-- セクション一覧 -->
            <div class="flex-1 min-h-0 overflow-hidden border-t border-border pt-1.5">
              <div v-if="card.sections.length === 0 && !card.hasUnsorted" class="text-xs text-muted-foreground italic">
                空っぽ
              </div>
              <template v-else>
                <div
                  v-for="sec in card.sections.slice(0, 4)"
                  :key="sec.id"
                  class="text-xs flex items-center gap-1.5 py-0.5"
                >
                  <span>🗂️</span>
                  <span class="flex-1 truncate">{{ sec.title }}</span>
                  <span class="text-muted-foreground text-xs">{{ sec.childCount }}</span>
                </div>
                <div v-if="card.sections.length > 4" class="text-xs text-muted-foreground py-0.5">
                  + {{ card.sections.length - 4 }} 件
                </div>
                <div
                  v-if="card.hasUnsorted"
                  class="text-xs flex items-center gap-1.5 py-0.5 text-muted-foreground"
                >
                  <span>·</span>
                  <span>その他のタスク</span>
                </div>
              </template>
            </div>

            <!-- 最終更新 -->
            <div v-if="card.lastUpdated" class="text-xs text-muted-foreground border-t border-border pt-1.5">
              <div class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full shrink-0"
                  :class="card.lastUpdated.status === 'completed' ? 'bg-success' : card.lastUpdated.status === 'in_progress' ? 'bg-info' : 'bg-muted-foreground'"></span>
                <span class="truncate flex-1">{{ card.lastUpdated.title }}</span>
              </div>
              <div class="text-muted-foreground/70 ml-3">{{ formatRelative(card.lastUpdated.updatedAt) }}</div>
            </div>
          </div>
        </div>

        <!-- 注釈 -->
        <div
          v-for="ann in annotations"
          :key="ann.id"
          data-node="annotation"
          class="atlas-annotation absolute rounded-md shadow-md"
          :style="{
            left: ann.x + 'px', top: ann.y + 'px',
            width: ann.width + 'px', height: ann.height + 'px',
            background: ANNOTATION_COLORS[ann.color]?.bg || ANNOTATION_COLORS[0]!.bg,
            borderLeft: '4px solid ' + (ANNOTATION_COLORS[ann.color]?.border || ANNOTATION_COLORS[0]!.border),
            transform: `rotate(${ann.rotation}deg)`,
            zIndex: editingAnnotationId === ann.id ? 200 : 30,
            cursor: tool === 'eraser' ? 'not-allowed' : tool === 'link' ? 'crosshair' : 'move',
          }"
          @mousedown="onAnnotationMouseDown($event, ann)"
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

        <div v-if="projectCards.length === 0 && annotations.length === 0" class="absolute top-20 left-20 text-muted-foreground text-sm pointer-events-none">
          下のツールバーで「📁 プロジェクト」を選んで、空白をクリックすると始められます
        </div>
      </div>
    </div>

    <AtlasToolbar v-model="tool" :tools="availableTools" />
  </div>
</template>
