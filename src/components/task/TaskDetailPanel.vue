<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import RecurrencePicker from '@/components/task/RecurrencePicker.vue'
import type { TaskRecurrence } from '@/stores/tasks'

const panelStore = useTaskPanelStore()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()

const isOpen = computed(() => panelStore.taskId !== null || panelStore.taskNumber !== null)
const task = ref<Task | null>(null)
const titleEdit = ref('')
const descEdit = ref('')
const showAssignees = ref(false)
const newLabel = ref('')
const newSubtaskTitle = ref('')
const newComment = ref('')
const isLoading = ref(false)

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '緊急' },
  { value: 'important', label: '重要' },
  { value: 'normal', label: '通常' },
  { value: 'none', label: '－' },
] as const

// === プロジェクト移動（所属グループ横断） ===
interface MoveTargetGroup {
  group_id: string; group_name: string; group_slug: string
  projects: { id: string; name: string; slug: string; icon?: string; is_personal: number }[]
}
const moveTargets = ref<MoveTargetGroup[]>([])
async function loadMoveTargets() {
  if (moveTargets.value.length || !userStore.currentUser?.id) return
  const res = await api(`/api/users/${userStore.currentUser.id}/move-targets`)
  if (res.ok) moveTargets.value = await res.json()
}
async function moveToProject(projectId: string) {
  if (!task.value || projectId === task.value.project_id) return
  let name = 'プロジェクト'
  for (const g of moveTargets.value) {
    const p = g.projects.find(x => x.id === projectId)
    if (p) { name = p.is_personal ? 'インボックス' : `${g.group_name} / ${p.name}`; break }
  }
  await tasksStore.moveToProject(task.value.id, projectId, name)
  // 移動でプロジェクト/タスク番号が変わり、現在のslug基準の解決が無効になるためパネルを閉じる
  // （取り消しは左下のUndoトーストから可能）
  close()
}

async function loadTask() {
  if (!isOpen.value) {
    task.value = null
    return
  }
  isLoading.value = true
  try {
    let resolvedId = panelStore.taskId
    // taskNumber 経由で開かれた場合は browse API で id を取得
    if (!resolvedId && panelStore.taskNumber && panelStore.groupSlug && panelStore.projectSlug) {
      const r = await api(`/api/browse/${panelStore.groupSlug}/projects/${panelStore.projectSlug}/tasks/${panelStore.taskNumber}`)
      if (r.ok) {
        const t = await r.json()
        resolvedId = t.id
      }
    }
    if (!resolvedId) return

    // group/project の補完（メンバー一覧、サイクル等用）
    if (panelStore.groupSlug && (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== panelStore.groupSlug)) {
      await groupsStore.fetchGroupBySlug(panelStore.groupSlug)
    }
    if (groupsStore.currentGroup?.id && groupsStore.members.length === 0) {
      await groupsStore.fetchMembers(groupsStore.currentGroup.id)
    }
    if (panelStore.groupSlug && panelStore.projectSlug &&
        (!projectsStore.currentProject || projectsStore.currentProject.slug !== panelStore.projectSlug)) {
      await projectsStore.fetchProjectBySlug(panelStore.groupSlug, panelStore.projectSlug)
      if (projectsStore.currentProject) {
        await projectsStore.fetchCycles(projectsStore.currentProject.id)
      }
    }

    await Promise.all([
      tasksStore.fetchTask(resolvedId),
      tasksStore.fetchComments(resolvedId),
    ])
    task.value = tasksStore.currentTask
    titleEdit.value = task.value?.title || ''
    descEdit.value = task.value?.description || ''
    loadMoveTargets()
  } finally {
    isLoading.value = false
  }
}

watch(() => panelStore.taskId, loadTask)
watch(() => panelStore.taskNumber, loadTask)

function close() {
  panelStore.close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value && !showAssignees.value) {
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const isDone = computed(() => task.value?.status === 'completed')

const assigneeIds = computed<string[]>(() => {
  if (!task.value) return []
  if (Array.isArray(task.value.assignee_ids)) return task.value.assignee_ids as string[]
  if (typeof task.value.assignee_ids === 'string') {
    try { return JSON.parse(task.value.assignee_ids) } catch { return [] }
  }
  return task.value.assignee_id ? [task.value.assignee_id] : []
})

const assigneeNames = computed(() => assigneeIds.value
  .map(id => groupsStore.members.find(m => m.id === id)?.name)
  .filter(Boolean) as string[]
)

const labels = computed<string[]>(() => {
  if (!task.value) return []
  if (Array.isArray(task.value.labels)) return task.value.labels as string[]
  if (typeof task.value.labels === 'string') {
    try { return JSON.parse(task.value.labels) } catch { return [] }
  }
  return []
})

async function toggleDone() {
  if (!task.value || !userStore.currentUser?.id) return
  const next = isDone.value ? 'not_started' : 'completed'
  await tasksStore.updateStatus(task.value.id, next, userStore.currentUser.id)
  task.value.status = next
}

async function toggleAssignee(userId: string) {
  if (!task.value) return
  const cur = new Set(assigneeIds.value)
  cur.has(userId) ? cur.delete(userId) : cur.add(userId)
  const newIds = [...cur]
  await tasksStore.updateTask(task.value.id, {
    assignee_ids: newIds, assignee_id: newIds[0] || null,
    updated_by: userStore.currentUser?.id,
  } as any)
}

async function saveTitle() {
  if (!task.value || titleEdit.value === task.value.title) return
  await tasksStore.updateTask(task.value.id, {
    title: titleEdit.value, updated_by: userStore.currentUser?.id,
  })
}

async function saveDescription() {
  if (!task.value || descEdit.value === (task.value.description || '')) return
  await tasksStore.updateTask(task.value.id, {
    description: descEdit.value, updated_by: userStore.currentUser?.id,
  })
}

async function changePriority(priority: 'urgent' | 'important' | 'normal' | 'none') {
  if (!task.value) return
  await api(`/api/tasks/${task.value.id}/priority`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority, updated_by: userStore.currentUser?.id }),
  })
  task.value.priority = priority
}

async function changeCycle(cycleId: string | null) {
  if (!task.value) return
  await tasksStore.updateTask(task.value.id, {
    cycle_id: cycleId, updated_by: userStore.currentUser?.id,
  } as any)
}
async function changeStartDate(date: string) {
  if (!task.value) return
  await tasksStore.updateTask(task.value.id, {
    start_date: date || null, updated_by: userStore.currentUser?.id,
  } as any)
}
async function changeDueDate(date: string) {
  if (!task.value) return
  // 期限を消したら時刻も消す（時刻だけの期限は成立しない）
  const patch: any = { due_date: date || null, updated_by: userStore.currentUser?.id }
  if (!date) patch.due_time = null
  await tasksStore.updateTask(task.value.id, patch)
  if (!date && task.value) task.value.due_time = null
}
async function changeDueTime(time: string) {
  if (!task.value) return
  await tasksStore.updateTask(task.value.id, {
    due_time: time || null, updated_by: userStore.currentUser?.id,
  } as any, { silent: true })
  task.value.due_time = time || null
}

// === 繰り返し設定（モーダル） ===
const showRecurrence = ref(false)
function onRecurrenceUpdated(rec: TaskRecurrence | null) {
  if (task.value) task.value.recurrence = rec
  showRecurrence.value = false
}

async function addLabel() {
  const v = newLabel.value.trim()
  if (!v || !task.value) return
  if (labels.value.includes(v)) { newLabel.value = ''; return }
  const updated = [...labels.value, v]
  await tasksStore.updateTask(task.value.id, {
    labels: updated, updated_by: userStore.currentUser?.id,
  } as any)
  newLabel.value = ''
}

async function removeLabel(label: string) {
  if (!task.value) return
  const updated = labels.value.filter(l => l !== label)
  await tasksStore.updateTask(task.value.id, {
    labels: updated, updated_by: userStore.currentUser?.id,
  } as any)
}

async function addSubtask() {
  const title = newSubtaskTitle.value.trim()
  if (!title || !task.value || !userStore.currentUser?.id || !projectsStore.currentProject) return
  await tasksStore.createTask({
    project_id: projectsStore.currentProject.id,
    parent_task_id: task.value.id,
    title,
    created_by: userStore.currentUser.id,
  })
  newSubtaskTitle.value = ''
  await tasksStore.fetchTask(task.value.id)
  task.value = tasksStore.currentTask
}

async function toggleSubtaskDone(child: Task) {
  if (!userStore.currentUser?.id || !task.value) return
  const next = child.status === 'completed' ? 'not_started' : 'completed'
  await tasksStore.updateStatus(child.id, next, userStore.currentUser.id)
  await tasksStore.fetchTask(task.value.id)
  task.value = tasksStore.currentTask
}

function openSubtaskInPanel(child: Task) {
  if (!panelStore.groupSlug || !panelStore.projectSlug) return
  panelStore.open({
    groupSlug: panelStore.groupSlug,
    projectSlug: panelStore.projectSlug,
    taskId: child.id,
    taskNumber: child.task_number,
  })
}

async function addComment() {
  if (!task.value || !userStore.currentUser?.id || !newComment.value.trim()) return
  await tasksStore.addComment(task.value.id, userStore.currentUser.id, newComment.value.trim())
  newComment.value = ''
}

function userInitial(name?: string | null) { return name?.charAt(0) ?? '?' }

function formatDate(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <Transition name="task-panel">
    <div v-if="isOpen" class="task-panel-wrapper fixed inset-0 z-40 pointer-events-none">
      <!-- 背景クリックで閉じる（軽い暗幕） -->
      <div
        class="absolute inset-0 bg-black/10 pointer-events-auto"
        @click="close"
      ></div>

      <!-- パネル本体（右からスライドイン） -->
      <aside
        class="task-panel absolute top-0 right-0 bottom-0 w-full sm:w-[480px] lg:w-[560px] bg-card shadow-2xl border-l border-border pointer-events-auto overflow-y-auto"
      >
        <div v-if="isLoading" class="p-6 text-muted-foreground text-sm">読み込み中…</div>
        <div v-else-if="task" class="p-5 space-y-5">
          <!-- ヘッダー: 閉じる / パンくず -->
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <button class="hover:text-foreground" @click="close" title="閉じる (Esc)">✕</button>
            <span>{{ task.project_name }}</span>
            <span>/</span>
            <span>T-{{ task.task_number }}</span>
          </div>

          <!-- チェック + タイトル -->
          <div class="flex items-start gap-3">
            <button
              class="w-6 h-6 mt-1.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
              :class="isDone ? 'border-success bg-success' : 'border-input hover:border-info'"
              @click="toggleDone"
              :title="isDone ? '完了に戻す' : '完了にする'"
            >
              <svg v-if="isDone" class="w-3.5 h-3.5 text-success-foreground" viewBox="0 0 12 12" fill="none">
                <path d="M2 6 L5 9 L10 3" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>
            <Input
              v-model="titleEdit"
              @blur="saveTitle"
              class="text-xl font-bold !h-auto !py-2 flex-1"
              :class="{ 'line-through opacity-60': isDone }"
            />
          </div>

          <!-- メタデータ -->
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <select
              :value="task.priority"
              @change="changePriority(($event.target as HTMLSelectElement).value as any)"
              class="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option v-for="p in PRIORITY_OPTIONS" :key="p.value" :value="p.value">優先度: {{ p.label }}</option>
            </select>

            <label class="flex items-center gap-1 text-xs text-muted-foreground">
              開始
              <input
                type="date"
                :value="task.start_date || ''"
                @change="changeStartDate(($event.target as HTMLInputElement).value)"
                class="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
            </label>

            <label class="flex items-center gap-1 text-xs text-muted-foreground">
              期限
              <input
                type="date"
                :value="task.due_date || ''"
                @change="changeDueDate(($event.target as HTMLInputElement).value)"
                class="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
              <input
                type="time"
                :value="task.due_time || ''"
                :disabled="!task.due_date"
                title="時刻（任意。M365カレンダー連携用）"
                @change="changeDueTime(($event.target as HTMLInputElement).value)"
                class="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-40"
              />
            </label>

            <!-- 繰り返し設定 -->
            <button
              class="h-8 rounded-md border border-input bg-background px-2 text-xs flex items-center gap-1 hover:bg-muted"
              :class="{ 'text-info border-info/50': task.recurrence }"
              title="繰り返しを設定"
              @click="showRecurrence = true"
            >
              <span>🔁</span>
              <span>{{ task.recurrence?.rule_text || '繰り返し' }}</span>
            </button>

            <select
              v-if="projectsStore.cycles.length > 0"
              :value="task.cycle_id || ''"
              @change="changeCycle(($event.target as HTMLSelectElement).value || null)"
              class="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">サイクル: なし</option>
              <option v-for="c in projectsStore.cycles" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>

            <!-- プロジェクト移動（所属グループ横断） -->
            <select
              :value="task.project_id"
              @change="moveToProject(($event.target as HTMLSelectElement).value)"
              class="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[180px]"
              title="別のプロジェクトへ移動"
            >
              <optgroup v-for="g in moveTargets" :key="g.group_id" :label="g.group_name">
                <option v-for="p in g.projects" :key="p.id" :value="p.id">
                  {{ p.is_personal ? '📥 インボックス' : `${p.icon || '📁'} ${p.name}` }}
                </option>
              </optgroup>
            </select>

            <!-- 担当者 -->
            <div class="relative">
              <button
                class="h-8 rounded-md border border-input bg-background px-2 text-xs flex items-center gap-1.5 hover:bg-muted"
                @click="showAssignees = !showAssignees"
              >
                <span class="text-muted-foreground">担当:</span>
                <template v-if="assigneeNames.length === 0">
                  <span class="text-muted-foreground">未割当</span>
                </template>
                <template v-else>
                  <span
                    v-for="(name, i) in assigneeNames.slice(0, 3)"
                    :key="i"
                    class="w-5 h-5 rounded-full bg-info/15 text-info text-xs flex items-center justify-center font-medium"
                    :title="name"
                  >{{ userInitial(name) }}</span>
                  <span v-if="assigneeNames.length > 3" class="text-muted-foreground">+{{ assigneeNames.length - 3 }}</span>
                </template>
              </button>
              <div
                v-if="showAssignees"
                class="absolute top-full left-0 mt-1 w-64 max-h-64 overflow-auto bg-card border border-border rounded-md shadow-lg z-30 py-1"
                @click.stop
              >
                <div
                  v-for="m in groupsStore.members"
                  :key="m.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer"
                  @click="toggleAssignee(m.id)"
                >
                  <input type="checkbox" :checked="assigneeIds.includes(m.id)" class="pointer-events-none" />
                  <span class="w-6 h-6 rounded-full bg-info/15 text-info text-xs flex items-center justify-center font-medium">
                    {{ userInitial(m.name) }}
                  </span>
                  <span class="text-sm">{{ m.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ラベル -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-muted-foreground">ラベル:</span>
            <span
              v-for="label in labels"
              :key="label"
              class="text-xs px-2 py-0.5 rounded-full bg-info/10 text-info flex items-center gap-1 group"
            >
              {{ label }}
              <button class="opacity-50 group-hover:opacity-100 hover:text-destructive" @click="removeLabel(label)">×</button>
            </span>
            <input
              v-model="newLabel"
              type="text"
              placeholder="+ ラベル追加（Enter）"
              class="h-7 text-xs rounded-md border border-input bg-background px-2 w-32"
              @keydown.enter="addLabel"
            />
          </div>

          <!-- 説明 -->
          <Textarea v-model="descEdit" @blur="saveDescription" rows="3" placeholder="説明（Markdown）" class="resize-y" />

          <!-- 子タスク -->
          <div class="border-t border-border pt-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">子タスク</h3>
            <div class="space-y-1">
              <div
                v-for="child in (task.children || [])"
                :key="child.id"
                class="flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/50 rounded-md cursor-pointer"
                @click="openSubtaskInPanel(child)"
              >
                <button
                  class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  :class="child.status === 'completed' ? 'border-success bg-success' : 'border-input hover:border-info'"
                  @click.stop="toggleSubtaskDone(child)"
                >
                  <svg v-if="child.status === 'completed'" class="w-3 h-3 text-success-foreground" viewBox="0 0 12 12">
                    <path d="M2 6 L5 9 L10 3" stroke="currentColor" stroke-width="2" fill="none" />
                  </svg>
                </button>
                <span class="text-xs text-muted-foreground">#{{ child.task_number }}</span>
                <span class="flex-1 text-sm" :class="{ 'line-through text-muted-foreground': child.status === 'completed' }">{{ child.title }}</span>
                <span v-if="child.assignee_name" class="text-xs text-muted-foreground">{{ child.assignee_name }}</span>
              </div>
              <div class="flex items-center gap-2 pt-2">
                <Input
                  v-model="newSubtaskTitle"
                  placeholder="子タスクを追加（Enter）"
                  class="text-sm"
                  @keydown.enter="addSubtask"
                />
                <Button :disabled="!newSubtaskTitle.trim()" size="sm" @click="addSubtask">追加</Button>
              </div>
            </div>
          </div>

          <!-- コメント -->
          <div class="border-t border-border pt-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">コメント</h3>
            <div class="space-y-3">
              <div v-for="c in tasksStore.comments" :key="c.id" class="flex gap-2 items-start">
                <span class="w-7 h-7 rounded-full bg-info/15 text-info text-xs flex items-center justify-center font-medium shrink-0">
                  {{ userInitial(c.user_name) }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{{ c.user_name }}</span>
                    <span class="text-xs text-muted-foreground">{{ formatDate(c.created_at) }}</span>
                  </div>
                  <p class="text-sm whitespace-pre-wrap">{{ c.content }}</p>
                </div>
              </div>
              <div class="flex gap-2 pt-2">
                <Textarea v-model="newComment" rows="1" placeholder="コメント…" />
                <Button :disabled="!newComment.trim()" @click="addComment">送信</Button>
              </div>
            </div>
          </div>
        </div>

        <!-- 繰り返し設定モーダル -->
        <Dialog v-model:open="showRecurrence">
          <DialogContent class="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>🔁 繰り返し設定</DialogTitle>
            </DialogHeader>
            <p class="text-xs text-muted-foreground -mt-2">
              完了すると期限が次回に進みます（タスクは完了になりません）
            </p>
            <RecurrencePicker
              v-if="task"
              :task-id="task.id"
              :initial="task.recurrence"
              @updated="onRecurrenceUpdated"
            />
          </DialogContent>
        </Dialog>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.task-panel-enter-active,
.task-panel-leave-active {
  transition: opacity 0.15s ease;
}
.task-panel-enter-active .task-panel,
.task-panel-leave-active .task-panel {
  transition: transform 0.2s ease-out;
}
.task-panel-enter-from,
.task-panel-leave-to {
  opacity: 0;
}
.task-panel-enter-from .task-panel,
.task-panel-leave-to .task-panel {
  transform: translateX(100%);
}
</style>
