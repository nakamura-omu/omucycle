<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore, type GroupMember } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)
const resolvedGroupId = computed(() => groupId.value || groupsStore.currentGroup?.id || '')

const showAddMemberModal = ref(false)
const showCreateUserModal = ref(false)

const newMemberEmail = ref('')
const newUser = ref({
  email: '',
  name: '',
})

// グループ設定
const groupSettings = ref({
  name: '',
  slug: '',
})
const isEditingSettings = ref(false)
const slugError = ref('')

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
  guest: 'ゲスト',
}

const roleOptions = ['admin', 'member', 'guest'] as const

onMounted(async () => {
  await groupsStore.fetchMembers(resolvedGroupId.value)
  loadGroupSettings()
})

watch(() => groupsStore.currentGroup, () => {
  loadGroupSettings()
})

function loadGroupSettings() {
  if (groupsStore.currentGroup) {
    groupSettings.value = {
      name: groupsStore.currentGroup.name,
      slug: groupsStore.currentGroup.slug || '',
    }
  }
}

function validateSlug(slug: string): boolean {
  if (!slug) return true // 空欄OK
  // 英数字とハイフンのみ、先頭と末尾はハイフン不可
  const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
  return pattern.test(slug)
}

async function saveGroupSettings() {
  if (!validateSlug(groupSettings.value.slug)) {
    slugError.value = '英小文字、数字、ハイフンのみ使用可能です（例: dx-suishin）'
    return
  }
  slugError.value = ''

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupSettings.value.name,
        slug: groupSettings.value.slug || null,
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      groupsStore.currentGroup = updated
      isEditingSettings.value = false

      // slugが変わった場合は新しいURLにリダイレクト
      if (updated.slug && updated.slug !== groupSlug.value) {
        router.replace(`/${updated.slug}/settings`)
      }
    } else {
      const err = await res.json()
      if (err.error?.includes('UNIQUE constraint')) {
        slugError.value = 'このスラッグは既に使用されています'
      } else {
        alert(err.error || '保存に失敗しました')
      }
    }
  } catch (error) {
    console.error('Failed to save group settings:', error)
  }
}

async function changeRole(member: GroupMember, newRole: string) {
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/members/${member.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      // メンバー一覧を再取得
      await groupsStore.fetchMembers(resolvedGroupId.value)
    }
  } catch (error) {
    console.error('Failed to change role:', error)
  }
}

async function removeMember(member: GroupMember) {
  if (!confirm(`${member.name} をグループから削除しますか？`)) return

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/members/${member.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await groupsStore.fetchMembers(resolvedGroupId.value)
    }
  } catch (error) {
    console.error('Failed to remove member:', error)
  }
}

async function createUserAndAdd() {
  if (!newUser.value.email.trim() || !newUser.value.name.trim()) return

  try {
    // 新規ユーザー作成
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

    // グループに追加
    const memberRes = await fetch(`/api/groups/${resolvedGroupId.value}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, role: 'member' }),
    })

    if (memberRes.ok) {
      await groupsStore.fetchMembers(resolvedGroupId.value)
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
    // メールでユーザー検索
    const usersRes = await fetch('/api/users')
    const users = await usersRes.json()
    const user = users.find((u: any) => u.email === newMemberEmail.value.trim())

    if (!user) {
      alert('ユーザーが見つかりません。新規ユーザーとして作成してください。')
      return
    }

    // グループに追加
    const memberRes = await fetch(`/api/groups/${resolvedGroupId.value}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, role: 'member' }),
    })

    if (memberRes.ok) {
      await groupsStore.fetchMembers(resolvedGroupId.value)
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
  <div class="settings-page">
    <h2>グループ設定</h2>

    <!-- 基本設定 -->
    <section class="settings-section">
      <div class="section-header">
        <h3>基本設定</h3>
        <div class="section-actions">
          <button
            v-if="!isEditingSettings"
            class="btn btn-secondary"
            @click="isEditingSettings = true"
          >
            編集
          </button>
          <template v-else>
            <button class="btn btn-secondary" @click="isEditingSettings = false; loadGroupSettings()">
              キャンセル
            </button>
            <button class="btn btn-primary" @click="saveGroupSettings">
              保存
            </button>
          </template>
        </div>
      </div>

      <div class="settings-form">
        <div class="form-group">
          <label>グループ名</label>
          <input
            v-if="isEditingSettings"
            v-model="groupSettings.name"
            type="text"
            placeholder="グループ名"
          />
          <span v-else class="form-value">{{ groupsStore.currentGroup?.name }}</span>
        </div>

        <div class="form-group">
          <label>URL スラッグ</label>
          <div v-if="isEditingSettings" class="slug-input-wrapper">
            <span class="slug-prefix">{{ window.location.origin }}/</span>
            <input
              v-model="groupSettings.slug"
              type="text"
              placeholder="dx-suishin"
              class="slug-input"
            />
          </div>
          <span v-else class="form-value">
            <template v-if="groupsStore.currentGroup?.slug">
              {{ window.location.origin }}/{{ groupsStore.currentGroup.slug }}
            </template>
            <template v-else>
              <span class="text-muted">未設定</span>
            </template>
          </span>
          <p v-if="slugError" class="error-text">{{ slugError }}</p>
          <p class="help-text">英小文字、数字、ハイフンが使えます（例: dx-suishin）</p>
        </div>
      </div>
    </section>

    <!-- メンバー管理 -->
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
          v-for="member in groupsStore.members"
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

        <div v-if="groupsStore.members.length === 0" class="empty-state">
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
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
}

.settings-page h2 {
  font-size: 1.25rem;
  color: #1a1a2e;
  margin: 0 0 1.5rem 0;
}

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

/* 基本設定 */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-value {
  font-size: 0.875rem;
  color: #333;
}

.slug-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
}

.slug-prefix {
  font-size: 0.875rem;
  color: #666;
  background: #f5f5f5;
  padding: 0.625rem 0.5rem;
  border: 1px solid #ddd;
  border-right: none;
  border-radius: 6px 0 0 6px;
}

.slug-input {
  flex: 1;
  border-radius: 0 6px 6px 0 !important;
}

.help-text {
  font-size: 0.75rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.error-text {
  font-size: 0.75rem;
  color: #dc2626;
  margin: 0.25rem 0 0 0;
}

.text-muted {
  color: #999;
  font-style: italic;
}
</style>
