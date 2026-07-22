<script setup lang="ts">
import { onMounted, computed, watch } from 'vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import PageContainer from '@/components/layout/PageContainer.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import TaskRow from '@/components/task/TaskRow.vue'
import { Card, CardContent } from '@/components/ui/card'

const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

import { localDateStr } from '@/lib/date'

function todayStr() {
  return localDateStr()
}

async function load() {
  if (!userStore.currentUser?.id) return
  await tasksStore.fetchMyTasks(userStore.currentUser.id, { hideCompleted: true })
}
onMounted(load)
watch(() => userStore.currentUser?.id, load)

const today = computed(() => todayStr())

const overdue = computed(() => tasksStore.myTasks.filter(t =>
  t.status !== 'completed' && t.due_date && t.due_date < today.value
))
const dueToday = computed(() => tasksStore.myTasks.filter(t =>
  t.status !== 'completed' && t.due_date === today.value
))

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

const empty = computed(() => overdue.value.length === 0 && dueToday.value.length === 0)
</script>

<template>
  <PageContainer narrow>
    <h1 class="text-2xl font-bold flex items-center gap-2 mb-1">
      <span>📅</span>
      <span>今日</span>
    </h1>
    <p class="text-sm text-muted-foreground mb-4">
      期限切れと今日が期限のタスク
    </p>

    <EmptyState v-if="empty" message="今日やることはありません 🎉" />

    <div v-else class="space-y-4">
      <Card v-if="overdue.length > 0">
        <CardContent class="p-3">
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-2 text-destructive">
            ⚠️ 期限切れ
            <span class="text-xs text-muted-foreground ml-auto">{{ overdue.length }}</span>
          </h3>
          <div class="space-y-1">
            <TaskRow
              v-for="t in overdue"
              :key="t.id"
              :task="t"
              :draggable="true"
              @toggle="toggleStatus"
              @click="openTask"
            />
          </div>
        </CardContent>
      </Card>

      <Card v-if="dueToday.length > 0">
        <CardContent class="p-3">
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
            📍 今日
            <span class="text-xs text-muted-foreground ml-auto">{{ dueToday.length }}</span>
          </h3>
          <div class="space-y-1">
            <TaskRow
              v-for="t in dueToday"
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
