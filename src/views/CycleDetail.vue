<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import TaskRow from '@/components/task/TaskRow.vue'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)
const cycleNumber = computed(() => parseInt(route.params.cycleNumber as string, 10))

const cycle = ref<any>(null)

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!projectsStore.currentProject || projectsStore.currentProject.slug !== projectSlug.value) {
    await projectsStore.fetchProjectBySlug(groupSlug.value, projectSlug.value)
  }
  const r = await api(`/api/browse/${groupSlug.value}/projects/${projectSlug.value}/cycles/${cycleNumber.value}`)
  if (!r.ok) return
  cycle.value = await r.json()
  if (cycle.value?.id && projectsStore.currentProject) {
    await tasksStore.fetchProjectTasks(projectsStore.currentProject.id, { cycleId: cycle.value.id })
  }
}

onMounted(load)
watch([groupSlug, projectSlug, cycleNumber], load)

const grouped = computed(() => {
  const todo = tasksStore.tasks.filter(t => t.status !== 'completed')
  const completed = tasksStore.tasks.filter(t => t.status === 'completed')
  return { todo, completed }
})

const stats = computed(() => {
  const total = tasksStore.tasks.length
  const completed = grouped.value.completed.length
  const todo = grouped.value.todo.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { total, completed, todo, percent }
})

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  await tasksStore.updateStatus(task.id, task.status, userStore.currentUser.id)
  const t = tasksStore.tasks.find(x => x.id === task.id)
  if (t) t.status = task.status
}

function openTask(t: Task) {
  taskPanelStore.open({
    groupSlug: groupSlug.value,
    projectSlug: projectSlug.value,
    taskId: t.id,
    taskNumber: t.task_number,
  })
}

async function changeStatus(status: 'upcoming' | 'active' | 'completed') {
  if (!cycle.value) return
  const res = await api(`/api/cycles/${cycle.value.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (res.ok) cycle.value = { ...cycle.value, ...(await res.json()) }
}

function formatRange(start: string, end: string) {
  const fmt = (s: string) => new Date(s).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  return `${fmt(start)} 〜 ${fmt(end)}`
}
</script>

<template>
  <PageContainer>
    <div v-if="!cycle" class="text-muted-foreground py-12 text-center">読み込み中…</div>
    <div v-else>
      <PageHeader :title="cycle.name">
        <Button variant="ghost" @click="router.push(`/${groupSlug}/${projectSlug}/cycles`)">← サイクル一覧</Button>
      </PageHeader>

      <Card class="mb-6">
        <CardContent class="p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">{{ formatRange(cycle.start_date, cycle.end_date) }}</span>
            <div class="flex items-center gap-2">
              <button
                v-for="s in ['upcoming', 'active', 'completed'] as const"
                :key="s"
                class="text-xs px-3 py-1 rounded-md border"
                :class="cycle.status === s ? 'bg-info text-info-foreground border-info' : 'border-input hover:bg-muted'"
                @click="changeStatus(s)"
              >
                {{ s === 'upcoming' ? '未開始' : s === 'active' ? '進行中' : '完了' }}
              </button>
            </div>
          </div>
          <div v-if="cycle.description" class="text-sm text-muted-foreground">{{ cycle.description }}</div>
          <div>
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-muted-foreground">進捗</span>
              <span>{{ stats.percent }}%</span>
            </div>
            <div class="h-2 bg-muted rounded-full overflow-hidden">
              <div class="h-full bg-info" :style="{ width: stats.percent + '%' }"></div>
            </div>
            <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>やること {{ stats.todo }}</span>
              <span>完了 {{ stats.completed }}</span>
              <span>合計 {{ stats.total }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- やること（フラット） -->
      <div class="space-y-1">
        <TaskRow
          v-for="t in grouped.todo"
          :key="t.id"
          :task="t"
          :group-slug="groupSlug"
          :project-slug="projectSlug"
          @toggle="toggleStatus"
          @click="openTask"
        />
      </div>

      <!-- 完了 -->
      <Card v-if="grouped.completed.length > 0" class="mt-6">
        <CardContent class="p-3">
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
            <span class="w-2 h-2 rounded-full bg-success"></span>
            完了
            <span class="text-xs ml-auto">{{ grouped.completed.length }}</span>
          </h3>
          <div class="space-y-1 opacity-70">
            <TaskRow
              v-for="t in grouped.completed"
              :key="t.id"
              :task="t"
              :group-slug="groupSlug"
              :project-slug="projectSlug"
              @toggle="toggleStatus"
              @click="openTask"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  </PageContainer>
</template>
