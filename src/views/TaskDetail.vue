<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import PageContainer from '@/components/layout/PageContainer.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)
const taskNumber = computed(() => parseInt(route.params.taskNumber as string, 10))

const titleEdit = ref('')
const descEdit = ref('')

const showAssignees = ref(false)
const newLabel = ref('')
const newSubtaskTitle = ref('')

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (groupsStore.currentGroup?.id) {
    await groupsStore.fetchMembers(groupsStore.currentGroup.id)
  }
  if (!projectsStore.currentProject || projectsStore.currentProject.slug !== projectSlug.value) {
    await projectsStore.fetchProjectBySlug(groupSlug.value, projectSlug.value)
    if (projectsStore.currentProject) {
      await projectsStore.fetchCycles(projectsStore.currentProject.id)
    }
  }
  const res = await api(`/api/browse/${groupSlug.value}/projects/${projectSlug.value}/tasks/${taskNumber.value}`)
  if (!res.ok) return
  const t = await res.json()
  await Promise.all([
    tasksStore.fetchTask(t.id),
    tasksStore.fetchComments(t.id),
  ])
  titleEdit.value = tasksStore.currentTask?.title || ''
  descEdit.value = tasksStore.currentTask?.description || ''
}

onMounted(load)
watch([groupSlug, projectSlug, taskNumber], load)

const task = computed(() => tasksStore.currentTask)

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

const isDone = computed(() => task.value?.status === 'completed')

async function toggleDone() {
  if (!task.value || !userStore.currentUser?.id) return
  const next = isDone.value ? 'not_started' : 'completed'
  await tasksStore.updateStatus(task.value.id, next, userStore.currentUser.id)
}

async function toggleAssignee(userId: string) {
  if (!task.value) return
  const cur = new Set(assigneeIds.value)
  cur.has(userId) ? cur.delete(userId) : cur.add(userId)
  const newIds = [...cur]
  await tasksStore.updateTask(task.value.id, {
    assignee_ids: newIds,
    assignee_id: newIds[0] || null,
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
  await tasksStore.updateTask(task.value.id, {
    due_date: date || null, updated_by: userStore.currentUser?.id,
  } as any)
}

// === ラベル ===
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

// === 子タスク ===
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
}

async function toggleSubtaskDone(child: Task) {
  if (!userStore.currentUser?.id || !task.value) return
  const next = child.status === 'completed' ? 'not_started' : 'completed'
  await tasksStore.updateStatus(child.id, next, userStore.currentUser.id)
  await tasksStore.fetchTask(task.value.id)
}

function openSubtask(child: Task) {
  router.push(`/${groupSlug.value}/${projectSlug.value}/tasks/${child.task_number}`)
}

// === コメント ===
const newComment = ref('')
async function addComment() {
  if (!task.value || !userStore.currentUser?.id || !newComment.value.trim()) return
  await tasksStore.addComment(task.value.id, userStore.currentUser.id, newComment.value.trim())
  newComment.value = ''
}

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '緊急', color: 'text-destructive' },
  { value: 'important', label: '重要', color: 'text-warning' },
  { value: 'normal', label: '通常', color: 'text-info' },
  { value: 'none', label: '－', color: 'text-muted-foreground' },
] as const

function backToProject() {
  router.push(`/${groupSlug.value}/${projectSlug.value}`)
}

function userInitial(name?: string) {
  return name?.charAt(0) ?? '?'
}

function formatDate(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <PageContainer narrow>
    <div v-if="!task" class="text-muted-foreground py-12 text-center">読み込み中…</div>
    <div v-else class="space-y-5">
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <button @click="backToProject" class="hover:text-foreground">{{ task.project_name }}</button>
        <span>/</span>
        <span>T-{{ task.task_number }}</span>
      </div>

      <!-- タイトル + チェック -->
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

      <!-- メタデータ帯 -->
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <!-- 優先度 -->
        <select
          :value="task.priority"
          @change="changePriority(($event.target as HTMLSelectElement).value as any)"
          class="h-8 rounded-md border border-input bg-background px-2 text-xs"
          title="優先度"
        >
          <option v-for="p in PRIORITY_OPTIONS" :key="p.value" :value="p.value">優先度: {{ p.label }}</option>
        </select>

        <!-- 開始日 -->
        <label class="flex items-center gap-1 text-xs text-muted-foreground">
          開始
          <input
            type="date"
            :value="task.start_date || ''"
            @change="changeStartDate(($event.target as HTMLInputElement).value)"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </label>

        <!-- 期限 -->
        <label class="flex items-center gap-1 text-xs text-muted-foreground">
          期限
          <input
            type="date"
            :value="task.due_date || ''"
            @change="changeDueDate(($event.target as HTMLInputElement).value)"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </label>

        <!-- サイクル -->
        <select
          v-if="projectsStore.cycles.length > 0"
          :value="task.cycle_id || ''"
          @change="changeCycle(($event.target as HTMLSelectElement).value || null)"
          class="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">サイクル: なし</option>
          <option v-for="c in projectsStore.cycles" :key="c.id" :value="c.id">{{ c.name }}</option>
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
            @click="openSubtask(child)"
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

    <div v-if="showAssignees" class="fixed inset-0 z-20" @click="showAssignees = false"></div>
  </PageContainer>
</template>
