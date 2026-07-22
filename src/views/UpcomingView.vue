<script setup lang="ts">
import { onMounted, computed, watch } from 'vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import PageContainer from '@/components/layout/PageContainer.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import TaskRow from '@/components/task/TaskRow.vue'
import { Card, CardContent } from '@/components/ui/card'
import { localDateStr } from '@/lib/date'

const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

function dateStr(d: Date) {
  return localDateStr(d)
}

async function load() {
  if (!userStore.currentUser?.id) return
  await tasksStore.fetchMyTasks(userStore.currentUser.id, { hideCompleted: true })
}
onMounted(load)
watch(() => userStore.currentUser?.id, load)

interface DayBucket { dateStr: string; label: string; tasks: Task[] }

const buckets = computed<DayBucket[]>(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const result: DayBucket[] = []
  const allTasks = tasksStore.myTasks.filter(t => t.status !== 'completed' && t.due_date)
  const days = 14
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i)
    const ds = dateStr(d)
    const label = i === 0 ? '今日' : i === 1 ? '明日' : d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
    const tasks = allTasks.filter(t => t.due_date === ds)
    if (tasks.length > 0) result.push({ dateStr: ds, label, tasks })
  }
  // それ以降
  const future = allTasks.filter(t => {
    if (!t.due_date) return false
    const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days)
    return d >= cutoff
  }).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  if (future.length > 0) result.push({ dateStr: 'future', label: '2週間以上先', tasks: future })
  return result
})

async function toggleStatus(task: Task) {
  if (!userStore.currentUser?.id) return
  await tasksStore.updateStatus(task.id, task.status, userStore.currentUser.id)
  const t = tasksStore.myTasks.find(x => x.id === task.id)
  if (t) t.status = task.status
}

function openTask(task: Task) {
  if (task.group_slug && task.project_slug) {
    taskPanelStore.open({
      groupSlug: task.group_slug,
      projectSlug: task.project_slug,
      taskId: task.id,
      taskNumber: task.task_number,
    })
  }
}
</script>

<template>
  <PageContainer narrow>
    <h1 class="text-2xl font-bold flex items-center gap-2 mb-1">
      <span>📆</span>
      <span>近日予定</span>
    </h1>
    <p class="text-sm text-muted-foreground mb-4">期限が設定されたタスクを日付別に</p>

    <EmptyState v-if="buckets.length === 0" message="近日予定のタスクはありません" />

    <div v-else class="space-y-3">
      <Card v-for="b in buckets" :key="b.dateStr">
        <CardContent class="p-3">
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>{{ b.label }}</span>
            <span class="text-xs text-muted-foreground ml-auto">{{ b.tasks.length }}</span>
          </h3>
          <div class="space-y-1">
            <TaskRow
              v-for="t in b.tasks"
              :key="t.id"
              :task="t"
              :draggable="true"
              @toggle="toggleStatus"
              @click="openTask"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  </PageContainer>
</template>
