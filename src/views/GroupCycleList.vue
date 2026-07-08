<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { Card, CardContent } from '@/components/ui/card'
import EmptyState from '@/components/layout/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const cyclesByProject = ref<Record<string, any[]>>({})

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!groupsStore.currentGroup?.id) return
  await projectsStore.fetchGroupProjects(groupsStore.currentGroup.id)
  const map: Record<string, any[]> = {}
  await Promise.all(projectsStore.projects.map(async p => {
    const res = await api(`/api/projects/${p.id}/cycles`)
    if (res.ok) map[p.id] = await res.json()
  }))
  cyclesByProject.value = map
}

onMounted(load)
watch(groupSlug, load)

const allCycles = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return projectsStore.projects.flatMap(p =>
    (cyclesByProject.value[p.id] || []).map(c => ({
      project: p, cycle: c, isCurrent: c.start_date <= today && c.end_date >= today,
    }))
  )
})

const grouped = computed(() => ({
  active: allCycles.value.filter(x => x.cycle.status === 'active' || x.isCurrent),
  upcoming: allCycles.value.filter(x => x.cycle.status === 'upcoming' && !x.isCurrent),
  completed: allCycles.value.filter(x => x.cycle.status === 'completed'),
}))

function open(projectSlug: string, cycleNumber: number) {
  router.push(`/${groupSlug.value}/${projectSlug}/cycles/${cycleNumber}`)
}

function fmt(start: string, end: string) {
  const f = (s: string) => new Date(s).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  return `${f(start)} 〜 ${f(end)}`
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-bold">🔁 サイクル</h2>
    <p class="text-sm text-muted-foreground">
      プロジェクトごとに時間で区切ったスプリント。今走っているもの、これからのものを一覧します。
    </p>

    <EmptyState
      v-if="allCycles.length === 0"
      message="まだサイクルがありません。プロジェクトの「サイクル」から作成できます。"
    />

    <section v-if="grouped.active.length > 0">
      <h3 class="text-sm font-semibold text-info mb-2">進行中</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card v-for="x in grouped.active" :key="x.cycle.id" class="cursor-pointer hover:shadow-md" @click="open(x.project.slug, x.cycle.cycle_number)">
          <CardContent class="p-4 space-y-1">
            <div class="text-xs text-muted-foreground">{{ x.project.icon || '📁' }} {{ x.project.name }}</div>
            <div class="text-base font-semibold">{{ x.cycle.name }}</div>
            <div class="text-xs text-muted-foreground">{{ fmt(x.cycle.start_date, x.cycle.end_date) }}</div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section v-if="grouped.upcoming.length > 0">
      <h3 class="text-sm font-semibold text-muted-foreground mb-2">未開始</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card v-for="x in grouped.upcoming" :key="x.cycle.id" class="cursor-pointer hover:shadow-md" @click="open(x.project.slug, x.cycle.cycle_number)">
          <CardContent class="p-4 space-y-1">
            <div class="text-xs text-muted-foreground">{{ x.project.icon || '📁' }} {{ x.project.name }}</div>
            <div class="text-base font-semibold">{{ x.cycle.name }}</div>
            <div class="text-xs text-muted-foreground">{{ fmt(x.cycle.start_date, x.cycle.end_date) }}</div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section v-if="grouped.completed.length > 0">
      <h3 class="text-sm font-semibold text-muted-foreground mb-2">完了</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card v-for="x in grouped.completed" :key="x.cycle.id" class="cursor-pointer hover:shadow-md opacity-70" @click="open(x.project.slug, x.cycle.cycle_number)">
          <CardContent class="p-4 space-y-1">
            <div class="text-xs text-muted-foreground">{{ x.project.icon || '📁' }} {{ x.project.name }}</div>
            <div class="text-base font-semibold">{{ x.cycle.name }}</div>
            <div class="text-xs text-muted-foreground">{{ fmt(x.cycle.start_date, x.cycle.end_date) }}</div>
          </CardContent>
        </Card>
      </div>
    </section>
  </div>
</template>
