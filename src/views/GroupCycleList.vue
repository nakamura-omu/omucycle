<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { Card, CardContent } from '@/components/ui/card'
import EmptyState from '@/components/layout/EmptyState.vue'
import { localDateStr } from '@/lib/date'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const cyclesByProject = ref<Record<string, any[]>>({})
const showCompleted = ref(false)

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

const allCycles = computed(() =>
  projectsStore.projects.flatMap(p =>
    (cyclesByProject.value[p.id] || []).map(c => ({ project: p, cycle: c }))
  )
)

// アクティブ / 今後 / 完了 の3区分（期間終了した未完了サイクルは完了側に寄せる）
const grouped = computed(() => {
  const today = localDateStr()
  const done = (x: any) => x.cycle.status === 'completed' || x.cycle.end_date < today
  return {
    active: allCycles.value
      .filter(x => !done(x) && x.cycle.start_date <= today)
      .sort((a, b) => a.cycle.end_date.localeCompare(b.cycle.end_date)),
    upcoming: allCycles.value
      .filter(x => !done(x) && x.cycle.start_date > today)
      .sort((a, b) => a.cycle.start_date.localeCompare(b.cycle.start_date)),
    completed: allCycles.value
      .filter(done)
      .sort((a, b) => b.cycle.end_date.localeCompare(a.cycle.end_date)),
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

function open(projectSlug: string, cycleNumber: number) {
  router.push(`/${groupSlug.value}/${projectSlug}/cycles/${cycleNumber}`)
}

function fmt(start: string, end: string) {
  const f = (s: string) => new Date(s).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  return `${f(start)} 〜 ${f(end)}`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold">🔁 サイクル</h2>
      <p class="text-sm text-muted-foreground mt-1">
        プロジェクトごとに時間で区切ったスプリント。
      </p>
    </div>

    <EmptyState
      v-if="allCycles.length === 0"
      message="まだサイクルがありません。プロジェクトの「サイクル」から作成できます。"
    />

    <!-- アクティブ -->
    <section v-if="allCycles.length > 0">
      <h3 class="flex items-center gap-2 text-base font-semibold mb-3">
        <span class="w-2 h-2 rounded-full bg-info"></span>
        アクティブなサイクル
        <span class="text-xs font-normal text-muted-foreground">{{ grouped.active.length }}</span>
      </h3>
      <p v-if="grouped.active.length === 0" class="text-sm text-muted-foreground pl-4">
        いま走っているサイクルはありません
      </p>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card
          v-for="x in grouped.active" :key="x.cycle.id"
          class="cursor-pointer hover:shadow-md border-info/40"
          @click="open(x.project.slug, x.cycle.cycle_number)"
        >
          <CardContent class="p-4 space-y-2">
            <div class="text-xs text-muted-foreground">{{ x.project.icon || '📁' }} {{ x.project.name }}</div>
            <div class="text-base font-semibold">{{ x.cycle.name }}</div>
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{{ fmt(x.cycle.start_date, x.cycle.end_date) }}</span>
              <span class="text-info font-medium">{{ remainLabel(x.cycle) }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-muted overflow-hidden">
              <div class="h-full bg-info rounded-full" :style="{ width: elapsedPct(x.cycle) + '%' }"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- 今後 -->
    <section v-if="grouped.upcoming.length > 0">
      <h3 class="flex items-center gap-2 text-base font-semibold mb-3">
        <span class="w-2 h-2 rounded-full bg-warning"></span>
        今後のサイクル
        <span class="text-xs font-normal text-muted-foreground">{{ grouped.upcoming.length }}</span>
      </h3>
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

    <!-- 完了（既定で折りたたみ） -->
    <section v-if="grouped.completed.length > 0">
      <button
        class="flex items-center gap-2 text-base font-semibold mb-3 hover:opacity-80"
        @click="showCompleted = !showCompleted"
      >
        <span class="w-2 h-2 rounded-full bg-success"></span>
        完了したサイクル
        <span class="text-xs font-normal text-muted-foreground">{{ grouped.completed.length }}</span>
        <span class="text-xs text-muted-foreground">{{ showCompleted ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showCompleted" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
