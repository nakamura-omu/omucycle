<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useGroupsStore } from '@/stores/groups'
import { useTaskPanelStore } from '@/stores/taskPanel'
import EmptyState from '@/components/layout/EmptyState.vue'
import TaskRow from '@/components/task/TaskRow.vue'

const tasksStore = useTasksStore()
const userStore = useUserStore()
const groupsStore = useGroupsStore()
const taskPanelStore = useTaskPanelStore()

const groupFilter = ref<string>('all')
const showCompleted = ref(false)
const showOptions = ref(false)
const collapsed = ref<Record<string, boolean>>({})

async function load() {
  if (!userStore.currentUser?.id) return
  if (groupsStore.myGroups.length === 0) {
    await groupsStore.fetchMyGroups(userStore.currentUser.id)
  }
  await tasksStore.fetchMyTasks(userStore.currentUser.id, {
    hideCompleted: !showCompleted.value,
    groupId: groupFilter.value === 'all' ? undefined : groupFilter.value,
  })
}

onMounted(load)
watch([groupFilter, showCompleted, () => userStore.currentUser?.id], load)

const todoTasks = computed(() => tasksStore.myTasks.filter(t => t.status !== 'completed'))
const doneTasks = computed(() => tasksStore.myTasks.filter(t => t.status === 'completed'))

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

function toggleSection(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-1">
      <h1 class="text-2xl font-bold">📋 マイタスク</h1>
      <div class="relative">
        <button
          class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
          @click="showOptions = !showOptions"
        >表示 ▾</button>
        <div
          v-if="showOptions"
          class="absolute top-full right-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg z-30 py-1"
          @click.stop
        >
          <div class="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">フィルタ</div>
          <button
            class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
            @click="showCompleted = !showCompleted"
          >
            <span class="w-3 text-info">{{ showCompleted ? '✓' : '' }}</span>
            完了タスクも表示
          </button>
          <div class="border-t border-border my-1"></div>
          <div class="px-3 py-1.5">
            <label class="text-xs text-muted-foreground block mb-1">グループ</label>
            <select
              v-model="groupFilter"
              class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">すべて</option>
              <option v-for="g in groupsStore.myGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <p class="text-sm text-muted-foreground mb-4">
      {{ tasksStore.myTasks.length }} 件
      <span v-if="!showCompleted">・未完了のみ</span>
    </p>

    <div v-if="showOptions" class="fixed inset-0 z-20" @click="showOptions = false"></div>

    <EmptyState
      v-if="!tasksStore.isLoading && tasksStore.myTasks.length === 0"
      message="自分宛のタスクはありません 🎉"
    />

    <div v-else>
      <!-- やること（フラット） -->
      <div>
        <TaskRow
          v-for="t in todoTasks"
          :key="t.id"
          :task="t"
          @toggle="toggleStatus"
          @click="openTask"
        />
      </div>

      <!-- 完了 -->
      <section v-if="showCompleted && doneTasks.length > 0" class="mt-6 border-t border-border">
        <button
          class="w-full flex items-center gap-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 -mx-2 px-2 rounded"
          @click="toggleSection('done')"
        >
          <span class="text-xs w-3">{{ collapsed['done'] ? '▸' : '▾' }}</span>
          <span class="w-2 h-2 rounded-full bg-success"></span>
          <span>完了</span>
          <span class="text-xs font-normal">{{ doneTasks.length }}</span>
        </button>
        <div v-show="!collapsed['done']" class="pb-2 opacity-70">
          <TaskRow
            v-for="t in doneTasks"
            :key="t.id"
            :task="t"
            @toggle="toggleStatus"
            @click="openTask"
          />
        </div>
      </section>
    </div>
  </div>
</template>
