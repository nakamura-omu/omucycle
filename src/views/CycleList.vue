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

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const projectSlug = computed(() => route.params.projectSlug as string)

const showCreateDialog = ref(false)
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

const groupedCycles = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return {
    active: projectsStore.cycles.filter(c => c.start_date <= today && c.end_date >= today && c.status !== 'completed'),
    upcoming: projectsStore.cycles.filter(c => c.start_date > today && c.status !== 'completed'),
    completed: projectsStore.cycles.filter(c => c.status === 'completed' || c.end_date < today),
  }
})

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

function statusLabel(s: string) {
  return s === 'active' ? '進行中' : s === 'completed' ? '完了' : '未開始'
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
      <section v-if="groupedCycles.active.length > 0">
        <h3 class="text-sm font-semibold mb-2 text-info">進行中</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card
            v-for="c in groupedCycles.active"
            :key="c.id"
            class="cursor-pointer hover:shadow-md"
            @click="openCycle(c.cycle_number)"
          >
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-1">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-info/15 text-info">{{ statusLabel(c.status) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
              <p v-if="c.description" class="text-xs mt-2 line-clamp-2">{{ c.description }}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section v-if="groupedCycles.upcoming.length > 0">
        <h3 class="text-sm font-semibold mb-2 text-muted-foreground">未開始</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card v-for="c in groupedCycles.upcoming" :key="c.id" class="cursor-pointer hover:shadow-md" @click="openCycle(c.cycle_number)">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-1">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{{ statusLabel(c.status) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section v-if="groupedCycles.completed.length > 0">
        <h3 class="text-sm font-semibold mb-2 text-muted-foreground">完了</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card v-for="c in groupedCycles.completed" :key="c.id" class="cursor-pointer hover:shadow-md opacity-70" @click="openCycle(c.cycle_number)">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-1">
                <span class="text-base font-semibold">{{ c.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">{{ statusLabel(c.status) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ formatRange(c.start_date, c.end_date) }}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  </PageContainer>
</template>
