<script setup lang="ts">
import { ref, watch } from 'vue'
import type { GroupMember } from '@/stores/groups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import UserAvatar from '@/components/UserAvatar.vue'

const props = defineProps<{
  groupId: string
  members: GroupMember[]
}>()

const emit = defineEmits<{
  membersChanged: []
}>()

// メンバー候補はDirectory（学内名簿の正典）から検索する。
// ローカルユーザーの手作り・ゲスト作成は廃止（学外コラボはOMU-COLABに分離）
interface DirectoryCandidate {
  omuid: string
  display_name: string | null
  mail: string | null
  department: string | null
}

const showAddMemberModal = ref(false)
const searchQuery = ref('')
const searchResults = ref<DirectoryCandidate[]>([])
const searching = ref(false)
const searchError = ref('')
const addingOmuid = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (q) => {
  clearTimeout(debounceTimer)
  searchError.value = ''
  if (q.trim().length < 2) {
    searchResults.value = []
    return
  }
  debounceTimer = setTimeout(searchDirectory, 300)
})

async function searchDirectory() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return
  searching.value = true
  try {
    const res = await api(`/api/directory/search?q=${encodeURIComponent(q)}`)
    if (res.status === 503) {
      searchError.value = 'Directoryに接続できません（開発環境）'
      searchResults.value = []
      return
    }
    const data = await res.json()
    if (searchQuery.value.trim() !== q) return // 入力が進んでいたら破棄
    searchResults.value = data.users ?? []
    if (searchResults.value.length === 0) searchError.value = '該当者が見つかりません'
  } catch {
    searchError.value = '検索に失敗しました'
  } finally {
    searching.value = false
  }
}

function isMember(candidate: DirectoryCandidate): boolean {
  return props.members.some((m) => m.email === candidate.mail)
}

async function addCandidate(candidate: DirectoryCandidate) {
  if (!candidate.mail) return
  addingOmuid.value = candidate.omuid
  try {
    const res = await api(`/api/groups/${props.groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omuid: candidate.omuid,
        mail: candidate.mail,
        display_name: candidate.display_name,
        role: 'member',
      }),
    })
    if (res.ok) {
      emit('membersChanged')
    } else {
      const err = await res.json()
      alert(err.error || 'メンバー追加に失敗しました')
    }
  } catch (error) {
    console.error('Failed to add member:', error)
  } finally {
    addingOmuid.value = ''
  }
}

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
  guest: 'ゲスト',
}

const roleOptions = ['admin', 'member', 'guest'] as const

async function changeRole(member: GroupMember, newRole: string) {
  try {
    const res = await api(`/api/groups/${props.groupId}/members/${member.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      emit('membersChanged')
    }
  } catch (error) {
    console.error('Failed to change role:', error)
  }
}

async function removeMember(member: GroupMember) {
  if (!confirm(`${member.name} をグループから削除しますか？`)) return

  try {
    const res = await api(`/api/groups/${props.groupId}/members/${member.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      emit('membersChanged')
    }
  } catch (error) {
    console.error('Failed to remove member:', error)
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <Card class="mb-6">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <CardTitle class="text-base">メンバー</CardTitle>
      <Button size="sm" @click="showAddMemberModal = true">
        + メンバー追加
      </Button>
    </CardHeader>
    <CardContent>
      <div class="flex flex-col">
        <div
          v-for="member in members"
          :key="member.id"
          class="flex items-center gap-4 py-3 border-b border-border last:border-b-0"
        >
          <UserAvatar :name="member.name" :omuid="(member as any).omuid" size="md" />
          <div class="flex-1 min-w-0">
            <span class="block font-medium text-foreground">
              {{ member.name }}
              <span
                v-if="member.via === 'directory'"
                class="ml-1 text-xs font-normal text-muted-foreground"
                title="学内グループ連携で自動同期されたメンバー（AD側の名簿が正）"
              >🔗 連携</span>
            </span>
            <span class="block text-xs text-muted-foreground">{{ member.email }}</span>
          </div>
          <div class="shrink-0">
            <span class="text-xs text-muted-foreground">{{ formatDate(member.joined_at) }} 参加</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span v-if="member.via === 'directory'" class="text-sm text-muted-foreground px-2">
              {{ roleLabels[member.role] }}
            </span>
            <template v-else>
              <select
                :value="member.role"
                :disabled="member.role === 'owner'"
                class="px-2 py-1.5 border border-input rounded-md text-sm bg-background disabled:bg-muted disabled:text-muted-foreground"
                @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
              >
                <option v-if="member.role === 'owner'" value="owner">オーナー</option>
                <option v-for="role in roleOptions" :key="role" :value="role">
                  {{ roleLabels[role] }}
                </option>
              </select>
              <Button
                v-if="member.role !== 'owner'"
                variant="destructive"
                size="sm"
                class="h-7 text-xs"
                @click="removeMember(member)"
              >
                削除
              </Button>
            </template>
          </div>
        </div>

        <div v-if="members.length === 0" class="text-center text-muted-foreground py-8">
          メンバーがいません
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- メンバー追加モーダル（Directory名簿検索） -->
  <Dialog v-model:open="showAddMemberModal">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>メンバー追加</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-2">
          <Label>名前・omuid・メールで検索</Label>
          <Input
            v-model="searchQuery"
            placeholder="2文字以上で検索"
            autofocus
          />
        </div>
        <div v-if="searching" class="text-sm text-muted-foreground">検索中…</div>
        <div v-else-if="searchError" class="text-sm text-muted-foreground">{{ searchError }}</div>
        <div v-else-if="searchResults.length" class="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
          <div
            v-for="u in searchResults"
            :key="u.omuid"
            class="flex items-center gap-3 px-3 py-2"
          >
            <div class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-foreground">{{ u.display_name ?? u.omuid }}</span>
              <span class="block text-xs text-muted-foreground truncate">
                {{ [u.department, u.mail].filter(Boolean).join(' · ') }}
              </span>
            </div>
            <span v-if="isMember(u)" class="text-xs text-muted-foreground shrink-0">参加済み</span>
            <Button
              v-else
              size="sm"
              class="h-7 text-xs shrink-0"
              :disabled="!u.mail || addingOmuid === u.omuid"
              @click="addCandidate(u)"
            >
              {{ addingOmuid === u.omuid ? '追加中…' : '追加' }}
            </Button>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          候補は学内名簿（OMU-Directory）から検索されます。
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
