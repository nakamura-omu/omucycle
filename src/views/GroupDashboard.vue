<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const userStore = useUserStore()
const taskPanelStore = useTaskPanelStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const groupId = computed(() => groupsStore.currentGroup?.id || '')

interface HistoryEntry {
  id: string
  task_id: string
  user_name: string
  task_title: string
  task_number: number | null
  field_name: string | null
  created_at: string
}
const history = ref<HistoryEntry[]>([])

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!groupId.value) return
  const [_, hres] = await Promise.all([
    Promise.all([
      tasksStore.fetchGroupTasks(groupId.value),
      projectsStore.fetchGroupProjects(groupId.value),
    ]),
    api(`/api/groups/${groupId.value}/history?limit=8`),
  ])
  if (hres.ok) history.value = await hres.json()
}

onMounted(load)
watch(groupSlug, load)

const myTasks = computed(() => {
  if (!userStore.currentUser?.id) return []
  const me = userStore.currentUser.id
  return tasksStore.tasks.filter(t => {
    if (t.status === 'completed') return false
    if (t.assignee_id === me) return true
    if (Array.isArray(t.assignee_ids)) return t.assignee_ids.includes(me)
    if (typeof t.assignee_ids === 'string') {
      try { return JSON.parse(t.assignee_ids).includes(me) } catch { return false }
    }
    return false
  }).slice(0, 5)
})

const stats = computed(() => {
  const total = tasksStore.tasks.length
  const completed = tasksStore.tasksByStatus.completed.length
  const inProgress = tasksStore.tasksByStatus.in_progress.length
  return { total, completed, inProgress, notStarted: tasksStore.tasksByStatus.not_started.length }
})

function formatHistoryTime(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  const diff = (Date.now() - d.getTime()) / 60000
  if (diff < 1) return 'たった今'
  if (diff < 60) return `${Math.floor(diff)}分前`
  if (diff < 1440) return `${Math.floor(diff / 60)}時間前`
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function go(path: string) {
  router.push(`/${groupSlug.value}${path}`)
}

function openTask(t: Task) {
  if (t.project_slug) {
    taskPanelStore.open({
      groupSlug: groupSlug.value,
      projectSlug: t.project_slug,
      taskId: t.id,
      taskNumber: t.task_number,
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- ハブヘッダー -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold">{{ groupsStore.currentGroup?.name || 'グループ' }}</h2>
        <p class="text-sm text-muted-foreground mt-1">ここで何ができるか、ざっと見てみよう</p>
      </div>
    </div>

    <!-- 機能セクション（ハブ） -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <button class="text-left rounded-lg border border-border bg-card hover:shadow-md transition-shadow p-4 flex flex-col gap-1" @click="go('/tasks')">
        <span class="text-2xl">📋</span>
        <span class="text-base font-semibold">タスク</span>
        <span class="text-xs text-muted-foreground">やること一覧 / 追加</span>
      </button>
      <button class="text-left rounded-lg border border-border bg-card hover:shadow-md transition-shadow p-4 flex flex-col gap-1" @click="go('/atlas')">
        <span class="text-2xl">🗺️</span>
        <span class="text-base font-semibold">アトラス</span>
        <span class="text-xs text-muted-foreground">全体図でアイデアと整理</span>
      </button>
      <button class="text-left rounded-lg border border-border bg-card hover:shadow-md transition-shadow p-4 flex flex-col gap-1" @click="go('/wiki')">
        <span class="text-2xl">📖</span>
        <span class="text-base font-semibold">Wiki</span>
        <span class="text-xs text-muted-foreground">知識を共有する</span>
      </button>
      <button class="text-left rounded-lg border border-border bg-card opacity-60 transition-shadow p-4 flex flex-col gap-1 cursor-not-allowed" :title="'近日対応'">
        <span class="text-2xl">📁</span>
        <span class="text-base font-semibold">ファイル</span>
        <span class="text-xs text-muted-foreground">近日対応</span>
      </button>
      <button class="text-left rounded-lg border border-border bg-card hover:shadow-md transition-shadow p-4 flex flex-col gap-1" @click="go('/cycles')">
        <span class="text-2xl">🔁</span>
        <span class="text-base font-semibold">サイクル</span>
        <span class="text-xs text-muted-foreground">時間のリズム</span>
      </button>
    </div>

    <!-- 自分宛タスク + 統計 + 最近の履歴 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card class="md:col-span-2">
        <CardHeader class="pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-base">📌 自分宛のタスク</CardTitle>
          <Button variant="ghost" size="sm" @click="go('/tasks')">全部見る →</Button>
        </CardHeader>
        <CardContent>
          <div v-if="myTasks.length === 0" class="text-sm text-muted-foreground py-6 text-center">
            自分に割り当てられたタスクはありません 🎉
          </div>
          <div v-else class="space-y-1">
            <div
              v-for="t in myTasks"
              :key="t.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
              @click="openTask(t)"
            >
              <span class="w-2 h-2 rounded-full shrink-0" :class="t.status === 'in_progress' ? 'bg-info' : 'bg-muted-foreground'"></span>
              <span class="flex-1 truncate">{{ t.title }}</span>
              <span v-if="t.due_date" class="text-xs text-muted-foreground shrink-0">{{ t.due_date }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">📊 グループ全体</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <div class="text-2xl font-bold">{{ stats.notStarted }}</div>
              <div class="text-xs text-muted-foreground">未着手</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-info">{{ stats.inProgress }}</div>
              <div class="text-xs text-muted-foreground">進行中</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-success">{{ stats.completed }}</div>
              <div class="text-xs text-muted-foreground">完了</div>
            </div>
          </div>
          <div class="mt-3 text-xs text-muted-foreground">
            プロジェクト数: {{ projectsStore.projects.length }}
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 最近の動き -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">📝 最近の動き</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="history.length === 0" class="text-sm text-muted-foreground text-center py-4">
          まだ履歴はありません
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="h in history"
            :key="h.id"
            class="flex items-center gap-2 px-2 py-1 text-sm"
          >
            <span class="text-muted-foreground shrink-0">{{ formatHistoryTime(h.created_at) }}</span>
            <span class="text-foreground">{{ h.user_name }}</span>
            <span class="text-muted-foreground">が</span>
            <span class="text-info truncate">{{ h.task_title }}</span>
            <span class="text-muted-foreground">を更新</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
