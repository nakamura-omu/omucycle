<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, watch, ref } from 'vue'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'
import { useProjectsStore } from '@/stores/projects'

const emit = defineEmits<{ openQuickAdd: []; openAiChat: [] }>()

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const userStore = useUserStore()
const projectsStore = useProjectsStore()

const userInitial = computed(() => {
  if (!userStore.currentUser?.name) return '?'
  return userStore.currentUser.name.charAt(0).toUpperCase()
})

const userMenuOpen = ref(false)

const currentGroupSlug = computed(() => route.params.groupSlug as string | undefined)
const currentProjectSlug = computed(() => route.params.projectSlug as string | undefined)

const expandedGroups = ref<Set<string>>(new Set())
const groupProjectsCache = ref<Record<string, any[]>>({})

async function loadGroupProjects(groupId: string) {
  if (groupProjectsCache.value[groupId]) return
  await projectsStore.fetchGroupProjects(groupId)
  groupProjectsCache.value[groupId] = projectsStore.projects.filter((p: any) => p.is_personal === 0)
}

async function refresh() {
  if (!userStore.currentUser?.id) return
  await groupsStore.fetchMyGroups(userStore.currentUser.id)
  if (currentGroupSlug.value) {
    const g = groupsStore.myGroups.find(g => g.slug === currentGroupSlug.value)
    if (g) {
      expandedGroups.value.add(g.id)
      await loadGroupProjects(g.id)
    }
  }
}

function toggleGroup(group: any) {
  if (expandedGroups.value.has(group.id)) {
    expandedGroups.value.delete(group.id)
  } else {
    expandedGroups.value.add(group.id)
    loadGroupProjects(group.id)
  }
  expandedGroups.value = new Set(expandedGroups.value)
}

onMounted(refresh)
watch(() => userStore.currentUser?.id, refresh)
watch(currentGroupSlug, refresh)

function navigate(path: string) { router.push(path) }
function isActivePath(path: string, exact = false) {
  // インボックスは個人プロジェクト表示中もアクティブ
  if (path === '/my/inbox' && projectsStore.currentProject?.is_personal) return true
  if (exact) return route.path === path
  return route.path === path || route.path.startsWith(path + '/')
}

const personalItems = [
  { icon: '📥', label: 'インボックス', path: '/my/inbox' },
  { icon: '📅', label: '今日', path: '/my/today' },
  { icon: '📆', label: '近日予定', path: '/my/upcoming' },
  { icon: '✓', label: 'マイタスク', path: '/my/tasks' },
  { icon: '🏷️', label: 'フィルター&ラベル', path: '/my/filters' },
  { icon: '📌', label: 'ふせん', path: '/my/board' },
  { icon: '🔔', label: '通知', path: '/notifications' },
]

const myActiveTotal = computed(() =>
  groupsStore.myGroups.reduce((acc, g) => acc + (g.my_active_tasks ?? 0), 0)
)
const unreadTotal = computed(() =>
  groupsStore.myGroups.reduce((acc, g) => acc + (g.unread_count ?? 0), 0)
)
function personalBadge(path: string) {
  if (path === '/my/tasks') return myActiveTotal.value
  if (path === '/notifications') return unreadTotal.value
  return 0
}

function groupSections(slug: string) {
  return [
    { icon: '🗺️', label: 'アトラス', path: `/${slug}/atlas`, comingSoon: false },
    { icon: '📖', label: 'Wiki', path: `/${slug}/wiki`, comingSoon: false },
    { icon: '📁', label: 'ファイル', path: `/${slug}/files`, comingSoon: true },
    { icon: '🔁', label: 'サイクル', path: `/${slug}/cycles`, comingSoon: false },
    { icon: '⚙️', label: '設定', path: `/${slug}/settings`, comingSoon: false },
  ]
}
</script>

<template>
  <aside class="w-[240px] bg-sidebar-dark text-sidebar-foreground flex flex-col shrink-0 h-full">
    <!-- 上部: タスク追加 / AI -->
    <div class="px-2 pt-3 pb-2 border-b border-sidebar-accent/40 space-y-1.5">
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-info text-info-foreground hover:opacity-90 transition-opacity font-semibold text-sm"
        @click="emit('openQuickAdd')"
        title="タスクを追加 (Q)"
      >
        <span class="w-5 h-5 rounded-full bg-info-foreground/20 flex items-center justify-center">＋</span>
        <span class="flex-1 text-left">タスク追加</span>
        <span class="text-xs opacity-70">Q</span>
      </button>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/40 hover:bg-sidebar-accent/70 transition-colors text-sm"
        @click="emit('openAiChat')"
        title="AI に相談"
      >
        <span class="text-base">🤖</span>
        <span class="flex-1 text-left">AI に相談</span>
      </button>
      <div class="text-center">
        <span class="text-xs text-muted-foreground cursor-pointer hover:text-sidebar-foreground" @click="navigate('/')">
          OmuCycle
        </span>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto py-2 text-sm">
      <!-- 個人 -->
      <div class="px-2 py-1">
        <div
          v-for="item in personalItems"
          :key="item.path"
          class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-sidebar-accent/40"
          :class="{ 'bg-sidebar-accent/60': isActivePath(item.path) }"
          @click="navigate(item.path)"
        >
          <span class="text-base shrink-0">{{ item.icon }}</span>
          <span class="flex-1 truncate">{{ item.label }}</span>
          <span
            v-if="personalBadge(item.path) > 0"
            class="text-xs rounded-full bg-info text-info-foreground px-1.5 py-0.5 min-w-[1.25rem] text-center shrink-0"
          >{{ personalBadge(item.path) }}</span>
        </div>
      </div>

      <!-- グループ -->
      <div class="px-2 py-1 mt-3">
        <div class="flex items-center justify-between px-2 py-1 mb-1">
          <span class="text-xs text-muted-foreground uppercase tracking-wide font-semibold">グループ</span>
          <button
            class="text-xs text-muted-foreground hover:text-sidebar-foreground"
            title="グループ一覧"
            @click="navigate('/')"
          >＋</button>
        </div>

        <div v-for="g in groupsStore.myGroups" :key="g.id" class="mb-1">
          <div
            class="flex items-center gap-1 pl-1 pr-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-sidebar-accent/40"
            :class="{ 'bg-sidebar-accent/60': isActivePath(`/${g.slug}`, true) }"
          >
            <button
              class="text-xs text-muted-foreground hover:text-sidebar-foreground w-4 shrink-0"
              @click.stop="toggleGroup(g)"
            >{{ expandedGroups.has(g.id) ? '▾' : '▸' }}</button>
            <button
              class="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              @click="navigate(`/${g.slug || g.id}`)"
            >
              <span class="text-muted-foreground shrink-0">#</span>
              <span class="truncate">{{ g.name }}</span>
            </button>
            <span
              v-if="(g.my_active_tasks ?? 0) > 0"
              class="text-xs rounded-full bg-info text-info-foreground px-1.5 py-0.5 min-w-[1.25rem] text-center shrink-0"
            >{{ g.my_active_tasks }}</span>
            <span
              v-if="(g.unread_count ?? 0) > 0"
              class="w-1.5 h-1.5 rounded-full bg-warning shrink-0"
              title="未読あり"
            ></span>
          </div>

          <!-- 機能セクション -->
          <div v-if="expandedGroups.has(g.id)" class="ml-5 mt-0.5 mb-1 pl-2 border-l border-sidebar-accent/40">
            <div
              v-for="item in groupSections(g.slug || '')"
              :key="item.path"
              class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-sidebar-accent/40 text-sm"
              :class="{
                'bg-sidebar-accent/60': isActivePath(item.path),
                'opacity-50': item.comingSoon,
              }"
              @click="!item.comingSoon && navigate(item.path)"
              :title="item.comingSoon ? '近日対応' : ''"
            >
              <span class="shrink-0 text-sm">{{ item.icon }}</span>
              <span class="flex-1 truncate">{{ item.label }}</span>
              <span v-if="item.comingSoon" class="text-xs text-muted-foreground">soon</span>
            </div>

            <!-- プロジェクト一覧 -->
            <div v-if="(groupProjectsCache[g.id] || []).length > 0" class="mt-2 mb-0.5">
              <div class="text-xs text-muted-foreground px-2 py-0.5 uppercase tracking-wide">プロジェクト</div>
              <div
                v-for="p in groupProjectsCache[g.id]"
                :key="p.id"
                class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-sidebar-accent/40 text-sm"
                :class="{ 'bg-sidebar-accent/60': currentGroupSlug === g.slug && currentProjectSlug === p.slug }"
                @click="navigate(`/${g.slug}/${p.slug}`)"
              >
                <span class="shrink-0">{{ p.icon || '·' }}</span>
                <span class="truncate flex-1">{{ p.name }}</span>
                <span
                  v-if="(p.active_tasks ?? 0) > 0"
                  class="text-xs text-muted-foreground shrink-0"
                >{{ p.active_tasks }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- 底: ユーザーメニュー -->
    <div class="border-t border-sidebar-accent/40 p-2 relative">
      <button
        v-if="userStore.currentUser"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sidebar-accent/40"
        @click="userMenuOpen = !userMenuOpen"
      >
        <span class="w-7 h-7 rounded-full bg-info flex items-center justify-center text-info-foreground text-sm font-semibold shrink-0">
          {{ userInitial }}
        </span>
        <div class="flex-1 min-w-0 text-left">
          <div class="text-sm truncate">{{ userStore.currentUser.name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ userStore.currentUser.email }}</div>
        </div>
      </button>

      <div
        v-if="userMenuOpen"
        class="absolute left-2 right-2 bottom-full mb-1 bg-card border border-border rounded-md shadow-lg py-1 z-30"
        @click.stop
      >
        <button
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-foreground"
          @click="userMenuOpen = false; navigate('/settings')"
        >
          <span>⚙️</span>
          <span>設定</span>
        </button>
      </div>

      <div v-if="userMenuOpen" class="fixed inset-0 z-20" @click="userMenuOpen = false"></div>
    </div>
  </aside>
</template>
