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

// task の子孫（非セクションのみ）を再帰的にツリー化
function buildSubtree(parentId: string | null, all: Task[]): TaskTreeNode[] {
  return all
    .filter(t => (t.parent_task_id || null) === parentId && !t.is_section)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
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

async function addNewSection() {
  if (!projectsStore.currentProject || !userStore.currentUser?.id) return
  const title = prompt('セクション名')
  if (!title) return
  await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    title,
    is_section: true,
    created_by: userStore.currentUser.id,
  } as any)
  showOptions.value = false
}

async function addTaskToSection(sectionId: string) {
  if (!projectsStore.currentProject || !userStore.currentUser?.id) return
  const title = prompt('タスク名')
  if (!title) return
  await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    parent_task_id: sectionId,
    title,
    created_by: userStore.currentUser.id,
  } as any)
}

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  await tasksStore.updateStatus(task.id, task.status, userStore.currentUser.id)
  const t = tasksStore.tasks.find(x => x.id === task.id)
  if (t) t.status = task.status
}

// ドラッグ並び替え + セクション間移動
const dragTaskId = ref<string | null>(null)
const dragOverSectionId = ref<string | null>(null)

function onDragStart(_e: DragEvent, task: Task) { dragTaskId.value = task.id }
function onDragOver(e: DragEvent) { e.preventDefault() }

async function onDrop(_e: DragEvent, dropTarget: Task) {
  if (!dragTaskId.value || dragTaskId.value === dropTarget.id) {
    dragTaskId.value = null; return
  }
  const dragId = dragTaskId.value
  dragTaskId.value = null
  dragOverSectionId.value = null
  const dragTask = tasksStore.tasks.find(t => t.id === dragId)
  if (!dragTask) return

  const targetParentId = dropTarget.parent_task_id || null
  const dragParentId = dragTask.parent_task_id || null

  if (dragParentId !== targetParentId) {
    await tasksStore.updateTask(dragId, {
      parent_task_id: targetParentId,
      updated_by: userStore.currentUser?.id,
    } as any)
  }

  const updatedDrag = tasksStore.tasks.find(t => t.id === dragId)
  if (!updatedDrag) return
  const siblings = tasksStore.tasks
    .filter(t => (t.parent_task_id || null) === targetParentId
              && t.project_id === projectsStore.currentProject?.id
              && !t.is_section)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const dropIdx = siblings.findIndex(t => t.id === dropTarget.id)
  const dragIdx = siblings.findIndex(t => t.id === dragId)
  if (dropIdx < 0) return
  const reordered = [...siblings]
  if (dragIdx >= 0) reordered.splice(dragIdx, 1)
  reordered.splice(dropIdx, 0, updatedDrag)
  await api('/api/tasks/reorder-bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: reordered.map((t, i) => ({ id: t.id, sort_order: i })) }),
  })
  if (projectsStore.currentProject?.id) {
    await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
  }
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
    await tasksStore.updateTask(dragId, {
      parent_task_id: sectionId,
      updated_by: userStore.currentUser?.id,
    } as any)
    if (projectsStore.currentProject?.id) {
      await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
    }
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
  await tasksStore.updateTask(dragId, {
    parent_task_id: null,
    updated_by: userStore.currentUser?.id,
  } as any)
  if (projectsStore.currentProject?.id) {
    await tasksStore.fetchProjectTasks(projectsStore.currentProject.id)
  }
}

function openTask(task: Task) {
  taskPanelStore.open({
    groupSlug: groupSlug.value,
    projectSlug: projectSlug.value,
    taskId: task.id,
    taskNumber: task.task_number,
  })
}


const cycleLabel = computed(() => {
  if (cycleFilter.value === 'all') return 'すべて'
  if (cycleFilter.value === 'no_cycle') return 'サイクル未割当'
  const c = projectsStore.cycles.find(x => x.id === cycleFilter.value)
  return c?.name || ''
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-1">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <span>{{ projectsStore.currentProject?.is_personal ? '📥' : (projectsStore.currentProject?.icon || '📁') }}</span>
        <span>{{ projectsStore.currentProject?.is_personal ? 'インボックス' : (projectsStore.currentProject?.name || 'プロジェクト') }}</span>
      </h1>
      <div class="flex items-center gap-2">
        <button
          v-if="!projectsStore.currentProject?.is_personal"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="router.push(`/${groupSlug}/atlas/${projectSlug}`)"
        >🗺️ アトラス</button>
        <button
          v-else
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="router.push('/my/board')"
        >📌 ふせん</button>
        <button
          v-if="!projectsStore.currentProject?.is_personal"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="router.push(`/${groupSlug}/${projectSlug}/cycles`)"
        >🔁 サイクル</button>

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

            <div class="border-t border-border my-1"></div>
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">表示</div>
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="showCompleted = !showCompleted"
            >
              <span class="w-3 text-info">{{ showCompleted ? '✓' : '' }}</span>
              完了タスクも表示
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

            <div class="border-t border-border my-1"></div>
            <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">プロジェクト</div>
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="router.push(`/${groupSlug}/atlas/${projectSlug}`); showOptions = false"
            >
              <span class="text-base">🗺️</span>
              <span>アトラスで見る</span>
            </button>
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

    <!-- やること（フラット）-->
    <div
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
        @toggle="toggleStatus"
        @click="openTask"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @drop="onDrop"
      />

      <!-- セクション（やること内の子タスク） -->
      <div v-for="sec in todoSections" :key="sec.task.id" class="mt-3 group/sec">
        <div
          class="flex items-center gap-1 px-2 py-1.5 rounded text-sm font-semibold transition-colors"
          :class="dragOverSectionId === sec.task.id ? 'bg-info/20 ring-2 ring-info' : 'bg-muted/40 hover:bg-muted/60'"
          @dragover="onDragOverSection($event, sec.task.id)"
          @dragleave="onDragLeaveSection"
          @drop.prevent="onDropOnSection($event, sec.task.id)"
        >
          <button
            class="text-muted-foreground text-xs w-3"
            @click="toggleSectionGroup(sec.task.id)"
          >{{ sectionCollapsed[sec.task.id] ? '▸' : '▾' }}</button>
          <button
            class="flex items-center gap-2 flex-1 text-left"
            @click="toggleSectionGroup(sec.task.id)"
          >
            <span class="text-muted-foreground">🗂️</span>
            <span class="truncate">{{ sec.task.title }}</span>
            <span class="text-xs text-muted-foreground font-normal">{{ sec.children.length }}</span>
          </button>
          <button
            class="text-xs text-muted-foreground hover:text-info opacity-0 group-hover/sec:opacity-100 transition-opacity px-1.5"
            @click="addTaskToSection(sec.task.id)"
            title="このセクションにタスクを追加"
          >＋</button>
        </div>
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
            @toggle="toggleStatus"
            @click="openTask"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @drop="onDrop"
          />
          <div v-if="sec.children.length === 0" class="text-xs text-muted-foreground/70 italic py-1 px-2">
            空のセクション（タスクをここにドロップで入れられます）
          </div>
        </div>
      </div>
    </div>

    <!-- 完了 (showCompleted=true のときのみ折りたたみで表示) -->
    <section v-if="showCompleted && doneTotal > 0" class="mt-6 border-t border-border">
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
