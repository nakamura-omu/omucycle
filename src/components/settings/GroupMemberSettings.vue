<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { GroupMember } from '@/stores/groups'

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
    const res = await fetch(`/api/groups/${props.groupId}/members/${member.id}/role`, {
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
    const res = await fetch(`/api/groups/${props.groupId}/members/${member.id}`, {
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
    const userRes = await fetch('/api/users', {
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

    const memberRes = await fetch(`/api/groups/${props.groupId}/members`, {
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
    const usersRes = await fetch('/api/users')
    const users = await usersRes.json()
    const user = users.find((u: any) => u.email === newMemberEmail.value.trim())

    if (!user) {
      alert('ユーザーが見つかりません。新規ユーザーとして作成してください。')
      return
    }

    const memberRes = await fetch(`/api/groups/${props.groupId}/members`, {
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
  <section class="settings-section">
    <div class="section-header">
      <h3>メンバー</h3>
      <div class="section-actions">
        <button class="btn btn-secondary" @click="showAddMemberModal = true">
          既存ユーザーを追加
        </button>
        <button class="btn btn-primary" @click="showCreateUserModal = true">
          + 新規ユーザー作成
        </button>
      </div>
    </div>

    <div class="members-list">
      <div
        v-for="member in members"
        :key="member.id"
        class="member-row"
      >
        <div class="member-info">
          <span class="member-name">{{ member.name }}</span>
          <span class="member-email">{{ member.email }}</span>
        </div>
        <div class="member-meta">
          <span class="joined-at">{{ formatDate(member.joined_at) }} 参加</span>
        </div>
        <div class="member-actions">
          <select
            :value="member.role"
            :disabled="member.role === 'owner'"
            @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
          >
            <option v-if="member.role === 'owner'" value="owner">オーナー</option>
            <option v-for="role in roleOptions" :key="role" :value="role">
              {{ roleLabels[role] }}
            </option>
          </select>
          <button
            v-if="member.role !== 'owner'"
            class="btn btn-danger btn-sm"
            @click="removeMember(member)"
          >
            削除
          </button>
        </div>
      </div>

      <div v-if="members.length === 0" class="empty-state">
        メンバーがいません
      </div>
    </div>
  </section>

  <!-- 既存ユーザー追加モーダル -->
  <div v-if="showAddMemberModal" class="modal-overlay" @click.self="showAddMemberModal = false">
    <div class="modal">
      <h2>既存ユーザーを追加</h2>
      <div class="form-group">
        <label>メールアドレス</label>
        <input
          v-model="newMemberEmail"
          type="email"
          placeholder="user@example.com"
          @keyup.enter="addExistingUser"
        />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showAddMemberModal = false">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="addExistingUser">
          追加
        </button>
      </div>
    </div>
  </div>

  <!-- 新規ユーザー作成モーダル -->
  <div v-if="showCreateUserModal" class="modal-overlay" @click.self="showCreateUserModal = false">
    <div class="modal">
      <h2>新規ユーザー作成</h2>
      <div class="form-group">
        <label>名前 *</label>
        <input
          v-model="newUser.name"
          type="text"
          placeholder="山田 太郎"
        />
      </div>
      <div class="form-group">
        <label>メールアドレス *</label>
        <input
          v-model="newUser.email"
          type="email"
          placeholder="taro.yamada@example.com"
        />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showCreateUserModal = false">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="createUserAndAdd">
          作成して追加
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-section {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 0.5rem;
}

.members-list {
  display: flex;
  flex-direction: column;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid #eee;
}

.member-row:last-child {
  border-bottom: none;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  display: block;
  font-weight: 500;
  color: #1a1a2e;
}

.member-email {
  display: block;
  font-size: 0.75rem;
  color: #666;
}

.member-meta {
  flex-shrink: 0;
}

.joined-at {
  font-size: 0.75rem;
  color: #999;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.member-actions select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.member-actions select:disabled {
  background: #f5f5f5;
  color: #999;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 2rem;
}

/* ボタン */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fecaca;
}

/* モーダル */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;
}

.modal h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
