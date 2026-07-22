<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

// 学内の実グループ（共有メールボックス=課・係の正典単位）との連携。
// 連携するとメンバーがDirectoryからミラーされる（読み取り専用）。手動メンバーは共存。
const props = defineProps<{
  groupId: string
  group: any | null
}>()

const emit = defineEmits<{
  linkChanged: []
}>()

interface DirectoryGroupCandidate {
  group_code: string
  display_name: string | null
  mail: string | null
  member_count?: number
}

const linked = computed(() => Boolean(props.group?.directory_group_code))

const searchQuery = ref('')
const searchResults = ref<DirectoryGroupCandidate[]>([])
const searching = ref(false)
const searchError = ref('')
const busy = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (q) => {
  clearTimeout(debounceTimer)
  searchError.value = ''
  if (q.trim().length < 2) {
    searchResults.value = []
    return
  }
  debounceTimer = setTimeout(searchGroups, 300)
})

async function searchGroups() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return
  searching.value = true
  try {
    const res = await api(`/api/directory/groups?q=${encodeURIComponent(q)}`)
    if (res.status === 503) {
      searchError.value = 'Directoryに接続できません（開発環境）'
      searchResults.value = []
      return
    }
    const data = await res.json()
    if (searchQuery.value.trim() !== q) return
    searchResults.value = data.groups ?? []
    if (searchResults.value.length === 0) searchError.value = '該当するグループが見つかりません'
  } catch {
    searchError.value = '検索に失敗しました'
  } finally {
    searching.value = false
  }
}

async function link(candidate: DirectoryGroupCandidate) {
  busy.value = true
  try {
    const res = await api(`/api/groups/${props.groupId}/directory-link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_code: candidate.group_code }),
    })
    if (res.ok) {
      searchQuery.value = ''
      searchResults.value = []
      emit('linkChanged')
    } else {
      const err = await res.json()
      alert(err.error || '連携に失敗しました')
    }
  } finally {
    busy.value = false
  }
}

async function unlink() {
  if (!confirm('連携を解除しますか？ ミラーされたメンバーはグループから外れます（手動追加分は残ります）')) return
  busy.value = true
  try {
    const res = await api(`/api/groups/${props.groupId}/directory-link`, { method: 'DELETE' })
    if (res.ok) emit('linkChanged')
    else alert((await res.json()).error || '解除に失敗しました')
  } finally {
    busy.value = false
  }
}

async function refresh() {
  busy.value = true
  try {
    const res = await api(`/api/groups/${props.groupId}/directory-link/refresh`, { method: 'POST' })
    if (res.ok) emit('linkChanged')
    else alert((await res.json()).error || '同期に失敗しました')
  } finally {
    busy.value = false
  }
}

function formatSyncedAt(v: string | null | undefined) {
  if (!v) return '未同期'
  const d = new Date(v.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? v : d.toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Card class="mb-6">
    <CardHeader class="pb-4">
      <CardTitle class="text-base">学内グループ連携</CardTitle>
    </CardHeader>
    <CardContent>
      <!-- 連携中 -->
      <div v-if="linked" class="space-y-3">
        <div class="flex items-center gap-3">
          <span class="text-lg">🔗</span>
          <div class="flex-1 min-w-0">
            <span class="block font-medium text-foreground">{{ group?.directory_group_name || group?.directory_group_code }}</span>
            <span class="block text-xs text-muted-foreground">
              {{ group?.directory_group_code }} ・ 最終同期: {{ formatSyncedAt(group?.directory_synced_at) }}
            </span>
          </div>
          <Button variant="outline" size="sm" class="h-7 text-xs" :disabled="busy" @click="refresh">今すぐ同期</Button>
          <Button variant="destructive" size="sm" class="h-7 text-xs" :disabled="busy" @click="unlink">解除</Button>
        </div>
        <p class="text-xs text-muted-foreground">
          メンバーは学内名簿（OMU-Directory）から自動で反映されます。連携メンバーの追加・削除はAD側の名簿が正です。
          手動で追加したメンバーはそのまま共存できます。
        </p>
      </div>

      <!-- 未連携 -->
      <div v-else class="space-y-3">
        <p class="text-sm text-muted-foreground">
          課・係の共有メールボックスと連携すると、メンバーが学内名簿から自動同期されます。
        </p>
        <div class="space-y-2">
          <Label>共有メールボックスを検索（名前・コード）</Label>
          <Input v-model="searchQuery" placeholder="例: 情報 / gr-joho（2文字以上）" />
        </div>
        <div v-if="searching" class="text-sm text-muted-foreground">検索中…</div>
        <div v-else-if="searchError" class="text-sm text-muted-foreground">{{ searchError }}</div>
        <div v-else-if="searchResults.length" class="max-h-60 overflow-y-auto divide-y divide-border rounded-md border border-border">
          <div v-for="g in searchResults" :key="g.group_code" class="flex items-center gap-3 px-3 py-2">
            <div class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-foreground">{{ g.display_name ?? g.group_code }}</span>
              <span class="block text-xs text-muted-foreground truncate">
                {{ [g.group_code, g.member_count != null ? `${g.member_count}人` : null].filter(Boolean).join(' · ') }}
              </span>
            </div>
            <Button size="sm" class="h-7 text-xs shrink-0" :disabled="busy" @click="link(g)">連携</Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
