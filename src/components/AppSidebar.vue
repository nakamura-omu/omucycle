<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()

// 旧形式（/groups/:id）または新形式（/:slug）のどちらか
const isGroupPage = computed(() => {
  return route.path.startsWith('/groups/') ||
    (route.params.groupSlug && !['my', 'inbox', 'flashcard', 'settings'].includes(route.params.groupSlug as string))
})
const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)

// ナビゲーション用のベースパス
const groupBasePath = computed(() => {
  if (groupSlug.value) {
    return `/${groupSlug.value}`
  }
  return `/groups/${groupId.value}`
})

const mainNavItems = [
  { path: '/', label: 'グループ一覧', icon: '📁' },
  { path: '/my/tasks', label: 'マイタスク', icon: '📋' },
  { path: '/my/calendar', label: 'マイカレンダー', icon: '📅' },
  { path: '/inbox', label: '受信トレイ', icon: '📥' },
  { path: '/flashcard', label: 'フラッシュカード', icon: '🎴' },
]

const groupNavItems = computed(() => [
  { path: `${groupBasePath.value}`, label: 'ダッシュボード', icon: '🏠', exact: true },
  { path: `${groupBasePath.value}/job-definitions`, label: '業務テンプレート', icon: '📖' },
  { path: `${groupBasePath.value}/job-instances`, label: '業務タスク', icon: '📂' },
  { path: `${groupBasePath.value}/tasks`, label: '全タスク', icon: '📋' },
  { path: `${groupBasePath.value}/calendar`, label: 'カレンダー', icon: '📅' },
  { path: `${groupBasePath.value}/settings`, label: '設定', icon: '⚙️' },
])

function navigate(path: string) {
  router.push(path)
}

function isActive(item: { path: string; exact?: boolean }) {
  if (item.exact) {
    return route.path === item.path
  }
  return route.path.startsWith(item.path)
}
</script>

<template>
  <aside class="app-sidebar">
    <nav class="sidebar-nav">
      <!-- メインナビ -->
      <div class="nav-section">
        <div
          v-for="item in mainNavItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          @click="navigate(item.path)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </div>
      </div>

      <!-- グループ内ナビ -->
      <template v-if="isGroupPage">
        <div class="nav-divider"></div>
        <div class="nav-section">
          <div class="nav-section-title">グループメニュー</div>
          <div
            v-for="item in groupNavItems"
            :key="item.path"
            class="nav-item"
            :class="{ active: isActive(item) }"
            @click="navigate(item.path)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </div>
        </div>
      </template>
    </nav>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 220px;
  background: #16213e;
  color: #ccc;
  padding: 1rem 0;
  flex-shrink: 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
}

.nav-section {
  padding: 0 0.5rem;
}

.nav-section-title {
  font-size: 0.75rem;
  color: #666;
  padding: 0.5rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  background: #4cc9f0;
  color: #1a1a2e;
}

.nav-icon {
  font-size: 1rem;
}

.nav-label {
  font-size: 0.875rem;
}

.nav-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0.75rem 0;
}
</style>
