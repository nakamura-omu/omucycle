<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useUserStore } from '@/stores/user'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { localDateStr } from '@/lib/date'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)

const showCreateDialog = ref(false)
const showCompleted = ref(false)
const newCycle = ref({ name: '', start_date: '', end_date: '', description: '' })
const errorMsg = ref('')

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!projectsStore.currentProject || projectsStore.currentProject.slug !== projectSlug.value) {
    await projectsStore.fetchProjectBySlug(groupSlug.value, projectSlug.value)
  }
  if (projectsStore.currentProject?.id) {
    await projectsStore.fetchCycles(projectsStore.currentProject.id)
  }
}

onMounted(load)
watch([groupSlug, projectSlug], load)

// アクティブ / 今後 / 完了 の3区分（期間終了した未完了サイクルは完了側に寄せる）
const groupedCycles = computed(() => {
  const today = localDateStr()
  const done = (c: any) => c.status === 'completed' || c.end_date < today
  return {
    active: projectsStore.cycles
      .filter(c => !done(c) && c.start_date <= today)
      .sort((a, b) => a.end_date.localeCompare(b.end_date)),
    upcoming: projectsStore.cycles
      .filter(c => !done(c) && c.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    completed: projectsStore.cycles
      .filter(done)
      .sort((a, b) => b.end_date.localeCompare(a.end_date)),
  }
})

// 期間の経過率（アクティブサイクルの残り時間を可視化）
function elapsedPct(c: any) {
  const s = new Date(c.start_date).getTime()
  const e = new Date(c.end_date).getTime()
  if (e <= s) return 100
  return Math.min(100, Math.max(0, Math.round((Date.now() - s) / (e - s) * 100)))
}
function remainLabel(c: any) {
  const days = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000)
  return days <= 0 ? '最終日' : `残り${days}日`
}

async function createCycle() {
  errorMsg.value = ''
  if (!projectsStore.currentProject || !userStore.currentUser?.id) return
  try {
    const res = await api('/api/cycles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectsStore.currentProject.id,
        name: newCycle.value.name,
        description: newCycle.value.description || undefined,
        start_date: newCycle.value.start_date,
        end_date: newCycle.value.end_date,
        created_by: userStore.currentUser.id,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      errorMsg.value = err.error || '作成に失敗しました'
      return
    }
    showCreateDialog.value = false
    newCycle.value = { name: '', start_date: '', end_date: '', description: '' }
    await projectsStore.fetchCycles(projectsStore.currentProject.id)
  } catch (e: any) {
    errorMsg.value = e.message || 'エラー'
  }
}

function openCycle(cycleNumber: number) {
  router.push(`/${groupSlug.value}/${projectSlug.value}/cycles/${cycleNumber}`)
}

function formatRange(start: string, end: string) {
  const s = new Date(start).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  const e = new Date(end).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  return `${s} 〜 ${e}`
}
</script>

<template>
  <PageContainer>
    <PageHeader :title="`${projectsStore.currentProject?.name ?? ''} のサイクル`">
      <Dialog v-model:open="showCreateDialog">
        <DialogTrigger as-child>
          <Button>＋ 新しいサイクル</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいサイクル</DialogTitle>
          </DialogHeader>
          <div class="space-y-3 py-2">
            <div>
              <label class="text-sm font-medium">名前</label>
              <Input v-model="newCycle.name" placeholder="例: 2026-Q2 第1スプリント" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-medium">開始日</label>
                <Input type="date" v-model="newCycle.start_date" />
              </div>
              <div>
                <label class="text-sm font-medium">終了日</label>
                <Input type="date" v-model="newCycle.end_date" />
              </div>
            </div>
            <div>
              <label class="text-sm font-medium">説明（任意）</label>
              <Input v-model="newCycle.description" />
            </div>
            <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" @click="showCreateDialog = false">キャンセル</Button>
            <Button
              :disabled="!newCycle.name || !newCycle.start_date || !newCycle.end_date"
              @click="createCycle"
            >作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageHeader>

    <EmptyState
      v-if="projectsStore.cycles.length === 0"
      message="まだサイクルがありません"
    >
      <Button @click="showCreateDialog = true">最初のサイクルを作る</Button>
    </EmptyState>

    <div v-else class="space-y-6">
      <!-- アクティブ -->
      <section>
        <h3 class="flex items-center gap-2 text-base font-semibold mb-3">
          <span class="w-2 h-2 rounded-full bg-info"></span>
          アクティブなサイクル
          <span class="text-xs font-normal text-muted-foreground">{{ groupedCycles.active.length }}</span>
        </h3>
        <p v-if="groupedCycles.active.length === 0" class="text-sm text-muted-foreground pl-4">
          いま走っているサイクルはありません
        </p>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card
            v-for="c in groupedCycles.active"
            :key="c.id"
            class="cursor-pointer hover:shadow-md border-info/40"
            @click="openCycle(c.cycle_number)"
          >
            <CardContent class="p-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-info/15 text-info">{{ remainLabel(c) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
              <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                <div class="h-full bg-info rounded-full" :style="{ width: elapsedPct(c) + '%' }"></div>
              </div>
              <p v-if="c.description" class="text-xs line-clamp-2">{{ c.description }}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- 今後 -->
      <section v-if="groupedCycles.upcoming.length > 0">
        <h3 class="flex items-center gap-2 text-base font-semibold mb-3">
          <span class="w-2 h-2 rounded-full bg-warning"></span>
          今後のサイクル
          <span class="text-xs font-normal text-muted-foreground">{{ groupedCycles.upcoming.length }}</span>
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card v-for="c in groupedCycles.upcoming" :key="c.id" class="cursor-pointer hover:shadow-md" @click="openCycle(c.cycle_number)">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-1">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">未開始</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- 完了（既定で折りたたみ） -->
      <section v-if="groupedCycles.completed.length > 0">
        <button
          class="flex items-center gap-2 text-base font-semibold mb-3 hover:opacity-80"
          @click="showCompleted = !showCompleted"
        >
          <span class="w-2 h-2 rounded-full bg-success"></span>
          完了したサイクル
          <span class="text-xs font-normal text-muted-foreground">{{ groupedCycles.completed.length }}</span>
          <span class="text-xs text-muted-foreground">{{ showCompleted ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showCompleted" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card v-for="c in groupedCycles.completed" :key="c.id" class="cursor-pointer hover:shadow-md opacity-70" @click="openCycle(c.cycle_number)">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-1">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">完了</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  </PageContainer>
</template>
