<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, watch, ref } from 'vue'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useDndStore } from '@/stores/dnd'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { api } from '@/lib/api'
import { localDateStr } from '@/lib/date'
import UserAvatar from '@/components/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const emit = defineEmits<{ openQuickAdd: []; openAiChat: []; close: [] }>()

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const userStore = useUserStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const dnd = useDndStore()
const taskPanelStore = useTaskPanelStore()

const userMenuOpen = ref(false)

const currentGroupSlug = computed(() => route.params.groupSlug as string | undefined)
const currentProjectSlug = computed(() => route.params.projectSlug as string | undefined)

const expandedGroups = ref<Set<string>>(new Set())
const groupProjectsCache = ref<Record<string, any[]>>({})

async function loadGroupProjects(groupId: string) {
  if (groupProjectsCache.value[groupId]) return
  // 共有ストア(projectsStore.projects)を上書きしないよう直接取得
  // （現在開いているグループのプロジェクト一覧が壊れるのを防ぐ）
  const res = await api(`/api/groups/${groupId}/projects`)
  if (res.ok) {
    const list = await res.json()
    groupProjectsCache.value[groupId] = list.filter((p: any) => p.is_personal === 0)
  }
}

async function refresh() {
  if (!userStore.currentUser?.id) return
  await groupsStore.fetchMyGroups(userStore.currentUser.id)
  if (currentGroupSlug.value) {
    const g = groupsStore.myGroups.find(g => g.slug === currentGroupSlug.value)
    if (g) {
      expandedGroups.value.add(g.id)
      await loadGroupProjects(g.id)
    }
  }
}

function toggleGroup(group: any) {
  if (expandedGroups.value.has(group.id)) {
    expandedGroups.value.delete(group.id)
  } else {
    expandedGroups.value.add(group.id)
    loadGroupProjects(group.id)
  }
  expandedGroups.value = new Set(expandedGroups.value)
}

onMounted(refresh)
watch(() => userStore.currentUser?.id, refresh)
watch(currentGroupSlug, refresh)

function navigate(path: string) { router.push(path) }
function isActivePath(path: string, exact = false) {
  // インボックスは個人プロジェクト表示中もアクティブ
  if (path === '/my/inbox' && projectsStore.currentProject?.is_personal) return true
  if (exact) return route.path === path
  return route.path === path || route.path.startsWith(path + '/')
}

const personalItems = [
  { icon: '📥', label: 'インボックス', path: '/my/inbox', dropKey: 'inbox' },
  { icon: '📅', label: '今日', path: '/my/today', dropKey: 'today' },
  { icon: '📆', label: '近日予定', path: '/my/upcoming', dropKey: 'upcoming' },
  { icon: '✓', label: 'マイタスク', path: '/my/tasks' },
  { icon: '🏷️', label: 'フィルター&ラベル', path: '/my/filters' },
  { icon: '🔔', label: '通知', path: '/notifications' },
] as { icon: string; label: string; path: string; dropKey?: string }[]

// === タスク検索（所属グループ横断 + 個人スペース） ===
const searchQ = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQ, (q) => {
  clearTimeout(searchTimer)
  if (!q.trim()) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    if (!userStore.currentUser?.id) return
    searching.value = true
    try {
      const res = await api(`/api/users/${userStore.currentUser.id}/search-tasks?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) searchResults.value = await res.json()
    } finally { searching.value = false }
  }, 250)
})
function openSearchResult(r: any) {
  taskPanelStore.open({
    groupSlug: r.group_slug, projectSlug: r.project_slug,
    taskId: r.id, taskNumber: r.task_number,
  })
  searchQ.value = ''
  searchResults.value = []
}

// === タスクのドロップ受け（Todoist流: 持ち上げてサイドバーへ） ===
const dropHover = ref<string | null>(null)

function onItemDragOver(key: string | undefined, e: DragEvent) {
  if (!key || !dnd.draggedTask) return
  e.preventDefault()
  dropHover.value = key
}
function onItemDragLeave(key: string | undefined) {
  if (dropHover.value === key) dropHover.value = null
}

let personalSpace: { group_id: string; project_id: string } | null = null
async function getPersonalSpace() {
  if (personalSpace) return personalSpace
  const res = await api(`/api/users/${userStore.currentUser!.id}/personal-space`)
  if (res.ok) personalSpace = await res.json()
  return personalSpace
}

async function setDueWithUndo(task: Task, due: string, label: string) {
  const prev = task.due_date ?? null
  await tasksStore.updateTask(task.id, { due_date: due, updated_by: userStore.currentUser?.id } as any, { silent: true })
  tasksStore.showUndoToast(`期限を${label}に変更しました`, () =>
    tasksStore.updateTask(task.id, { due_date: prev, updated_by: userStore.currentUser?.id } as any, { silent: true }))
}

async function onItemDrop(key: string | undefined) {
  const task = dnd.draggedTask
  dropHover.value = null
  if (!key || !task) return
  dnd.end()
  if (key === 'today') {
    await setDueWithUndo(task, localDateStr(), '今日')
  } else if (key === 'upcoming') {
    await setDueWithUndo(task, localDateStr(new Date(Date.now() + 86400000)), '明日')
  } else if (key === 'inbox') {
    const space = await getPersonalSpace()
    if (space) await tasksStore.moveToProject(task.id, space.project_id, 'インボックス')
  } else if (key.startsWith('proj:')) {
    const p = Object.values(groupProjectsCache.value).flat().find((x: any) => `proj:${x.id}` === key)
    if (p) await tasksStore.moveToProject(task.id, (p as any).id, (p as any).name)
  }
}

// === プロジェクト自体のD&D並び替え（Todoist流。同一グループ内のみ） ===
const dragProj = ref<{ groupId: string; projectId: string } | null>(null)
const projDrop = ref<{ projectId: string; pos: 'above' | 'below' } | null>(null)

function onProjDragStart(g: any, p: any, e: DragEvent) {
  dragProj.value = { groupId: g.id, projectId: p.id }
  e.dataTransfer?.setData('text/plain', p.id)
}
function onProjDragEnd() {
  dragProj.value = null
  projDrop.value = null
}
function onProjDragOver(g: any, p: any, e: DragEvent) {
  // タスクを掴んでいる場合は従来どおり「プロジェクトへ移設」のドロップ受け
  if (dnd.draggedTask) { onItemDragOver(`proj:${p.id}`, e); return }
  if (!dragProj.value || dragProj.value.groupId !== g.id || dragProj.value.projectId === p.id) return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  projDrop.value = { projectId: p.id, pos: e.clientY - rect.top >= rect.height / 2 ? 'below' : 'above' }
}
function onProjDragLeave(p: any) {
  onItemDragLeave(`proj:${p.id}`)
  if (projDrop.value?.projectId === p.id) projDrop.value = null
}
async function persistProjectOrder(groupId: string, orders: { id: string; sort_order: number }[]) {
  await api('/api/projects/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects: orders }),
  })
  // サイドバーのキャッシュと、開いているグループの一覧（タスク一覧のバケット順の源）を更新
  const pos = new Map(orders.map(o => [o.id, o.sort_order]))
  const list = groupProjectsCache.value[groupId]
  if (list) {
    for (const x of list) if (pos.has(x.id)) x.sort_order = pos.get(x.id)!
    groupProjectsCache.value[groupId] = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
  if (groupsStore.currentGroup?.id === groupId) {
    await projectsStore.fetchGroupProjects(groupId)
  }
}
async function onProjDrop(g: any, p: any) {
  if (dnd.draggedTask) { await onItemDrop(`proj:${p.id}`); return }
  const drag = dragProj.value
  const drop = projDrop.value
  onProjDragEnd()
  if (!drag || !drop || drag.groupId !== g.id || drag.projectId === p.id) return
  const list = [...(groupProjectsCache.value[g.id] || [])]
  const snapshot = list.map((x, i) => ({ id: x.id, sort_order: x.sort_order ?? i }))
  const moving = list.find(x => x.id === drag.projectId)
  if (!moving) return
  const without = list.filter(x => x.id !== drag.projectId)
  const idx = without.findIndex(x => x.id === p.id)
  if (idx < 0) return
  without.splice(idx + (drop.pos === 'below' ? 1 : 0), 0, moving)
  await persistProjectOrder(g.id, without.map((x, i) => ({ id: x.id, sort_order: i })))
  tasksStore.showUndoToast('プロジェクトを並び替えました', () => persistProjectOrder(g.id, snapshot))
}

const myActiveTotal = computed(() =>
  groupsStore.myGroups.reduce((acc, g) => acc + (g.my_active_tasks ?? 0), 0)
)
const unreadTotal = computed(() =>
  groupsStore.myGroups.reduce((acc, g) => acc + (g.unread_count ?? 0), 0)
)
function personalBadge(path: string) {
  if (path === '/my/tasks') return myActiveTotal.value
  if (path === '/notifications') return unreadTotal.value
  return 0
}

// === グループ作成 ===
const showCreateGroup = ref(false)
const newGroupName = ref('')
const creatingGroup = ref(false)
async function createGroup() {
  if (!newGroupName.value.trim() || !userStore.currentUser || creatingGroup.value) return
  creatingGroup.value = true
  try {
    const group = await groupsStore.createGroup(
      newGroupName.value.trim(), null, userStore.currentUser.id)
    showCreateGroup.value = false
    newGroupName.value = ''
    await refresh()
    router.push(`/${group.slug}`)
  } catch (error) {
    console.error('Failed to create group:', error)
  } finally {
    creatingGroup.value = false
  }
}

// グループはタスク中心（グループ名クリック=タスク一覧。補助機能だけをぶら下げる）
function groupSections(slug: string) {
  return [
    { icon: '📋', label: 'タスク', path: `/${slug}/tasks`, comingSoon: false },
    { icon: '🔁', label: 'サイクル', path: `/${slug}/cycles`, comingSoon: false },
    { icon: '📖', label: 'Wiki', path: `/${slug}/wiki`, comingSoon: false },
    { icon: '⚙️', label: '設定', path: `/${slug}/settings`, comingSoon: false },
  ]
}
</script>

<template>
  <aside class="w-full bg-sidebar text-sidebar-foreground border-r border-border flex flex-col shrink-0 h-full">
    <!-- 上部: タスク追加 / 閉じる / AI -->
    <div class="px-2 pt-3 pb-2 border-b border-sidebar-accent/40 space-y-1.5">
      <div class="flex items-center gap-1.5">
        <button
          class="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-semibold text-sm"
          @click="emit('openQuickAdd')"
          title="タスクを追加 (Q)"
        >
          <span class="w-5 h-5 rounded-full bg-primary-foreground/20 flex items-center justify-center">＋</span>
          <span class="flex-1 text-left">タスク追加</span>
          <span class="text-xs opacity-70">Q</span>
        </button>
        <button
          class="w-8 h-9 flex items-center justify-center rounded-md hover:bg-sidebar-accent/60 text-muted-foreground hover:text-sidebar-foreground shrink-0"
          title="メニューをたたむ"
          @click="emit('close')"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16M14 10l-2 2 2 2" />
          </svg>
        </button>
      </div>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/40 hover:bg-sidebar-accent/70 transition-colors text-sm"
        @click="emit('openAiChat')"
        title="AI に相談"
      >
        <span class="text-base">🤖</span>
        <span class="flex-1 text-left">AI に相談</span>
      </button>

      <!-- 検索（所属グループ横断） -->
      <div class="relative">
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-sidebar-accent/30 focus-within:bg-card focus-within:ring-1 focus-within:ring-ring">
          <span class="text-muted-foreground text-sm">🔍</span>
          <input
            v-model="searchQ"
            class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="検索"
            @keydown.esc="searchQ = ''"
          />
          <button v-if="searchQ" class="text-muted-foreground hover:text-foreground text-xs" @click="searchQ = ''">✕</button>
        </div>
        <div
          v-if="searchQ.trim()"
          class="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto py-1"
        >
          <div v-if="searching" class="px-3 py-2 text-xs text-muted-foreground">検索中…</div>
          <div v-else-if="searchResults.length === 0" class="px-3 py-2 text-xs text-muted-foreground">見つかりません</div>
          <button
            v-for="r in searchResults"
            :key="r.id"
            class="w-full text-left px-3 py-1.5 hover:bg-muted"
            @click="openSearchResult(r)"
          >
            <span class="block text-sm truncate" :class="{ 'line-through text-muted-foreground': r.status === 'completed' }">{{ r.title }}</span>
            <span class="block text-xs text-muted-foreground truncate">
              {{ r.is_personal ? 'インボックス' : `${r.group_name} / ${r.project_name}` }}
              <span v-if="r.due_date"> ・{{ r.due_date }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto py-2 text-sm">
      <!-- 個人 -->
      <div class="px-2 py-1">
        <div
          v-for="item in personalItems"
          :key="item.path"
          class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-sidebar-accent/40"
          :class="{
            'bg-primary/10 text-primary font-medium': isActivePath(item.path),
            'ring-2 ring-primary bg-primary/10': dropHover === item.dropKey && item.dropKey,
          }"
          @click="navigate(item.path)"
          @dragover="onItemDragOver(item.dropKey, $event)"
          @dragleave="onItemDragLeave(item.dropKey)"
          @drop.prevent="onItemDrop(item.dropKey)"
        >
          <span class="text-base shrink-0">{{ item.icon }}</span>
          <span class="flex-1 truncate">{{ item.label }}</span>
          <span
            v-if="personalBadge(item.path) > 0"
            class="text-xs text-muted-foreground min-w-[1.25rem] text-center shrink-0"
          >{{ personalBadge(item.path) }}</span>
        </div>
      </div>

      <!-- グループ -->
      <div class="px-2 py-1 mt-3">
        <div class="flex items-center justify-between px-2 py-1 mb-1">
          <span class="text-xs text-muted-foreground uppercase tracking-wide font-semibold">グループ</span>
          <button
            class="text-xs text-muted-foreground hover:text-sidebar-foreground"
            title="グループを作成"
            @click="showCreateGroup = true"
          >＋</button>
        </div>

        <div v-for="g in groupsStore.myGroups" :key="g.id" class="mb-1">
          <div
            class="flex items-center gap-1 pl-1 pr-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-sidebar-accent/40"
            :class="{ 'bg-primary/10 text-primary font-medium': isActivePath(`/${g.slug}`, true) }"
          >
            <button
              class="text-xs text-muted-foreground hover:text-sidebar-foreground w-4 shrink-0"
              @click.stop="toggleGroup(g)"
            >{{ expandedGroups.has(g.id) ? '▾' : '▸' }}</button>
            <button
              class="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              @click="navigate(`/${g.slug}`)"
            >
              <span class="text-muted-foreground shrink-0">#</span>
              <span class="truncate">{{ g.name }}</span>
            </button>
            <span
              v-if="(g.my_active_tasks ?? 0) > 0"
              class="text-xs text-muted-foreground min-w-[1.25rem] text-center shrink-0"
            >{{ g.my_active_tasks }}</span>
            <span
              v-if="(g.unread_count ?? 0) > 0"
              class="w-1.5 h-1.5 rounded-full bg-warning shrink-0"
              title="未読あり"
            ></span>
          </div>

          <!-- 機能セクション -->
          <div v-if="expandedGroups.has(g.id)" class="ml-5 mt-0.5 mb-1 pl-2 border-l border-sidebar-accent/40">
            <div
              v-for="item in groupSections(g.slug || '')"
              :key="item.path"
              class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-sidebar-accent/40 text-sm"
              :class="{
                'bg-primary/10 text-primary font-medium': isActivePath(item.path),
                'opacity-50': item.comingSoon,
              }"
              @click="!item.comingSoon && navigate(item.path)"
              :title="item.comingSoon ? '近日対応' : ''"
            >
              <span class="shrink-0 text-sm">{{ item.icon }}</span>
              <span class="flex-1 truncate">{{ item.label }}</span>
              <span v-if="item.comingSoon" class="text-xs text-muted-foreground">soon</span>
            </div>

            <!-- プロジェクト一覧 -->
            <div v-if="(groupProjectsCache[g.id] || []).length > 0" class="mt-2 mb-0.5">
              <div class="text-xs text-muted-foreground px-2 py-0.5 uppercase tracking-wide">プロジェクト</div>
              <div
                v-for="p in groupProjectsCache[g.id]"
                :key="p.id"
                class="relative flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-sidebar-accent/40 text-sm"
                :class="{
                  'bg-primary/10 text-primary font-medium': currentGroupSlug === g.slug && currentProjectSlug === p.slug,
                  'ring-2 ring-primary bg-primary/10': dropHover === `proj:${p.id}`,
                  'opacity-50': dragProj?.projectId === p.id,
                }"
                draggable="true"
                @click="navigate(`/${g.slug}/${p.slug}`)"
                @dragstart="onProjDragStart(g, p, $event)"
                @dragend="onProjDragEnd"
                @dragover="onProjDragOver(g, p, $event)"
                @dragleave="onProjDragLeave(p)"
                @drop.prevent="onProjDrop(g, p)"
              >
                <!-- プロジェクト並び替えの挿入位置インジケーター -->
                <div
                  v-if="projDrop && projDrop.projectId === p.id"
                  class="absolute left-1 right-1 h-0.5 bg-primary rounded pointer-events-none z-10"
                  :class="projDrop.pos === 'above' ? 'top-0' : 'bottom-0'"
                ></div>
                <span class="shrink-0">{{ p.icon || '·' }}</span>
                <span class="truncate flex-1">{{ p.name }}</span>
                <span
                  v-if="(p.active_tasks ?? 0) > 0"
                  class="text-xs text-muted-foreground shrink-0"
                >{{ p.active_tasks }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- 底: ユーザーメニュー -->
    <div class="border-t border-sidebar-accent/40 p-2 relative">
      <button
        v-if="userStore.currentUser"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sidebar-accent/40"
        @click="userMenuOpen = !userMenuOpen"
      >
        <UserAvatar :name="userStore.currentUser.name" :omuid="userStore.currentUser.omuid" size="md" />
        <div class="flex-1 min-w-0 text-left">
          <div class="text-sm truncate">{{ userStore.currentUser.name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ userStore.currentUser.email }}</div>
        </div>
      </button>

      <div
        v-if="userMenuOpen"
        class="absolute left-2 right-2 bottom-full mb-1 bg-card border border-border rounded-md shadow-lg py-1 z-30"
        @click.stop
      >
        <button
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-foreground"
          @click="userMenuOpen = false; navigate('/settings')"
        >
          <span>⚙️</span>
          <span>設定</span>
        </button>
      </div>

      <div v-if="userMenuOpen" class="fixed inset-0 z-20" @click="userMenuOpen = false"></div>
    </div>

    <!-- グループ作成ダイアログ -->
    <Dialog v-model:open="showCreateGroup">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>新しいグループを作成</DialogTitle>
        </DialogHeader>
        <div class="space-y-2 py-4">
          <Label for="sidebar-group-name">グループ名</Label>
          <Input
            id="sidebar-group-name"
            v-model="newGroupName"
            placeholder="例: DX推進課"
            @keyup.enter="createGroup"
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="showCreateGroup = false">キャンセル</Button>
          <Button :disabled="creatingGroup" @click="createGroup">作成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </aside>
</template>
