<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Notification {
  id: string
  kind: string
  ref_type: string
  ref_id: string
  group_id: string | null
  project_id: string | null
  actor_user_id: string | null
  actor_name: string | null
  group_name: string | null
  group_slug: string | null
  project_name: string | null
  project_slug: string | null
  title: string | null
  body: string | null
  read_at: string | null
  created_at: string
}

const router = useRouter()

const notifications = ref<Notification[]>([])
const filter = ref<'all' | 'unread'>('unread')
const isLoading = ref(false)

async function load() {
  isLoading.value = true
  try {
    const qs = filter.value === 'unread' ? '?unread=true' : ''
    const res = await api(`/api/notifications${qs}`)
    if (res.ok) notifications.value = await res.json()
  } catch (e) { console.error(e) }
  finally { isLoading.value = false }
}

onMounted(load)

async function markRead(n: Notification) {
  if (n.read_at) return
  await api(`/api/notifications/${n.id}/read`, { method: 'POST' })
  n.read_at = new Date().toISOString()
}

async function markAllRead() {
  await api('/api/notifications/mark-all-read', { method: 'POST' })
  notifications.value.forEach(n => { n.read_at = n.read_at || new Date().toISOString() })
  if (filter.value === 'unread') notifications.value = []
}

function open(n: Notification) {
  markRead(n)
  if (n.ref_type === 'task' && n.group_slug && n.project_slug) {
    router.push(`/${n.group_slug}/${n.project_slug}`)
  } else if (n.ref_type === 'wiki_page' && n.group_slug) {
    router.push(`/${n.group_slug}/wiki`)
  }
}

const unreadCount = computed(() => notifications.value.filter(n => !n.read_at).length)

function formatTime(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 60000
  if (diff < 1) return 'たった今'
  if (diff < 60) return `${Math.floor(diff)}分前`
  if (diff < 1440) return `${Math.floor(diff / 60)}時間前`
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}
</script>

<template>
  <PageContainer>
    <PageHeader title="受信トレイ">
      <Button v-if="unreadCount > 0" variant="ghost" @click="markAllRead">すべて既読</Button>
    </PageHeader>

    <div class="flex items-center gap-2 mb-4">
      <button
        class="text-xs px-3 py-1 rounded-full border"
        :class="filter === 'unread' ? 'bg-info text-info-foreground border-info' : 'border-input hover:bg-muted'"
        @click="filter = 'unread'; load()"
      >
        未読のみ
      </button>
      <button
        class="text-xs px-3 py-1 rounded-full border"
        :class="filter === 'all' ? 'bg-info text-info-foreground border-info' : 'border-input hover:bg-muted'"
        @click="filter = 'all'; load()"
      >
        すべて
      </button>
    </div>

    <EmptyState
      v-if="!isLoading && notifications.length === 0"
      :message="filter === 'unread' ? '未読の通知はありません 🎉' : '通知はありません'"
    />

    <div v-else class="space-y-2">
      <Card
        v-for="n in notifications"
        :key="n.id"
        class="cursor-pointer hover:shadow-sm transition-shadow"
        :class="{ 'border-info bg-info/5': !n.read_at }"
        @click="open(n)"
      >
        <CardContent class="p-3 flex items-start gap-3">
          <div class="text-base shrink-0">
            <span v-if="n.kind === 'task_assigned'">📋</span>
            <span v-else-if="n.kind === 'comment'">💬</span>
            <span v-else-if="n.kind === 'mention'">@</span>
            <span v-else-if="n.kind === 'progress_update'">📈</span>
            <span v-else>🔔</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm" :class="{ 'font-semibold': !n.read_at }">
              <span v-if="n.actor_name" class="text-muted-foreground">{{ n.actor_name }}: </span>
              {{ n.title || n.body || '' }}
            </p>
            <p v-if="n.title && n.body" class="text-xs text-muted-foreground line-clamp-2 mt-0.5">{{ n.body }}</p>
            <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span v-if="n.group_name">{{ n.group_name }}</span>
              <span v-if="n.project_name">/ {{ n.project_name }}</span>
              <span class="ml-auto">{{ formatTime(n.created_at) }}</span>
            </div>
          </div>
          <span v-if="!n.read_at" class="w-2 h-2 rounded-full bg-info shrink-0 mt-1.5"></span>
        </CardContent>
      </Card>
    </div>
  </PageContainer>
</template>
