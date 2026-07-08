<script setup lang="ts">
import { ref } from 'vue'
import type { GroupMember } from '@/stores/groups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'

const props = defineProps<{
  groupId: string
  members: GroupMember[]
}>()

const emit = defineEmits<{
  membersChanged: []
}>()

const showAddMemberModal = ref(false)
const showCreateUserModal = ref(false)
const newMemberEmail = ref('')
const newUser = ref({
  email: '',
  name: '',
})

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

async function createUserAndAdd() {
  if (!newUser.value.email.trim() || !newUser.value.name.trim()) return

  try {
    const userRes = await api('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newUser.value.email.trim(),
        name: newUser.value.name.trim(),
        auth_type: 'guest',
      }),
    })

    if (!userRes.ok) {
      const err = await userRes.json()
      alert(err.error || 'ユーザー作成に失敗しました')
      return
    }

    const user = await userRes.json()

    const memberRes = await api(`/api/groups/${props.groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, role: 'member' }),
    })

    if (memberRes.ok) {
      emit('membersChanged')
      showCreateUserModal.value = false
      newUser.value = { email: '', name: '' }
    }
  } catch (error) {
    console.error('Failed to create user:', error)
  }
}

async function addExistingUser() {
  if (!newMemberEmail.value.trim()) return

  try {
    const usersRes = await api('/api/users')
    const users = await usersRes.json()
    const user = users.find((u: any) => u.email === newMemberEmail.value.trim())

    if (!user) {
      alert('ユーザーが見つかりません。新規ユーザーとして作成してください。')
      return
    }

    const memberRes = await api(`/api/groups/${props.groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, role: 'member' }),
    })

    if (memberRes.ok) {
      emit('membersChanged')
      showAddMemberModal.value = false
      newMemberEmail.value = ''
    } else {
      const err = await memberRes.json()
      alert(err.error || 'メンバー追加に失敗しました')
    }
  } catch (error) {
    console.error('Failed to add member:', error)
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
      <div class="flex gap-2">
        <Button variant="secondary" size="sm" @click="showAddMemberModal = true">
          既存ユーザーを追加
        </Button>
        <Button size="sm" @click="showCreateUserModal = true">
          + 新規ユーザー作成
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div class="flex flex-col">
        <div
          v-for="member in members"
          :key="member.id"
          class="flex items-center gap-4 py-3 border-b border-border last:border-b-0"
        >
          <div class="flex-1 min-w-0">
            <span class="block font-medium text-foreground">{{ member.name }}</span>
            <span class="block text-xs text-muted-foreground">{{ member.email }}</span>
          </div>
          <div class="shrink-0">
            <span class="text-xs text-muted-foreground">{{ formatDate(member.joined_at) }} 参加</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
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
          </div>
        </div>

        <div v-if="members.length === 0" class="text-center text-muted-foreground py-8">
          メンバーがいません
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- 既存ユーザー追加モーダル -->
  <Dialog v-model:open="showAddMemberModal">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>既存ユーザーを追加</DialogTitle>
      </DialogHeader>
      <div class="space-y-2 py-4">
        <Label>メールアドレス</Label>
        <Input
          v-model="newMemberEmail"
          type="email"
          placeholder="user@example.com"
          @keyup.enter="addExistingUser"
        />
      </div>
      <DialogFooter>
        <Button variant="secondary" @click="showAddMemberModal = false">キャンセル</Button>
        <Button @click="addExistingUser">追加</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 新規ユーザー作成モーダル -->
  <Dialog v-model:open="showCreateUserModal">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>新規ユーザー作成</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <Label>名前 *</Label>
          <Input v-model="newUser.name" placeholder="山田 太郎" />
        </div>
        <div class="space-y-2">
          <Label>メールアドレス *</Label>
          <Input v-model="newUser.email" type="email" placeholder="taro.yamada@example.com" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" @click="showCreateUserModal = false">キャンセル</Button>
        <Button @click="createUserAndAdd">作成して追加</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
