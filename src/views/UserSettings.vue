<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()

const isEditing = ref(false)
const editForm = ref({
  name: '',
  email: '',
})
const isSaving = ref(false)

// ユーザーのイニシャル（アバター用）
const userInitial = computed(() => {
  const name = isEditing.value ? editForm.value.name : userStore.currentUser?.name
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
})

// アバターの背景色（名前からハッシュ生成）
const avatarColor = computed(() => {
  const name = isEditing.value ? editForm.value.name : userStore.currentUser?.name
  if (!name) return '#666'
  const colors = ['#4cc9f0', '#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4895ef', '#06d6a0', '#ffd166']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

onMounted(() => {
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
})

function startEdit() {
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
}

async function saveChanges() {
  if (!userStore.currentUser || !editForm.value.name.trim()) return

  isSaving.value = true
  try {
    const res = await fetch(`/api/users/${userStore.currentUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.value.name.trim(),
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      userStore.currentUser = updated
      isEditing.value = false
    } else {
      const err = await res.json()
      alert(err.error || '保存に失敗しました')
    }
  } catch (error) {
    console.error('Failed to update user:', error)
    alert('保存に失敗しました')
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <button class="back-btn" @click="goBack">← 戻る</button>
      <h1>アカウント設定</h1>
    </div>

    <div class="settings-content" v-if="userStore.currentUser">
      <!-- プロフィールセクション -->
      <section class="settings-section">
        <div class="section-header">
          <h2>プロフィール</h2>
          <button v-if="!isEditing" class="btn btn-secondary" @click="startEdit">
            編集
          </button>
        </div>

        <div class="profile-card">
          <div class="profile-avatar" :style="{ background: avatarColor }">
            {{ userInitial }}
          </div>

          <div class="profile-info">
            <div class="form-group">
              <label>名前</label>
              <input
                v-if="isEditing"
                v-model="editForm.name"
                type="text"
                placeholder="名前を入力"
              />
              <span v-else class="info-value">{{ userStore.currentUser.name }}</span>
            </div>

            <div class="form-group">
              <label>メールアドレス</label>
              <span class="info-value readonly">{{ userStore.currentUser.email }}</span>
              <span v-if="isEditing" class="help-text">メールアドレスは変更できません</span>
            </div>

            <div class="form-group">
              <label>認証タイプ</label>
              <span class="info-value readonly">
                {{ userStore.currentUser.auth_type === 'sso' ? 'SSO (Entra ID)' : 'ゲスト' }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="isEditing" class="edit-actions">
          <button class="btn btn-secondary" @click="cancelEdit" :disabled="isSaving">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="saveChanges" :disabled="isSaving">
            {{ isSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </section>

      <!-- アバターカラープレビュー -->
      <section class="settings-section">
        <h2>アバタープレビュー</h2>
        <p class="section-description">
          アバターの色は名前から自動生成されます。名前を変更すると色が変わることがあります。
        </p>
        <div class="avatar-preview">
          <div class="preview-avatar" :style="{ background: avatarColor }">
            {{ userInitial }}
          </div>
          <span class="preview-name">{{ isEditing ? editForm.name : userStore.currentUser.name }}</span>
        </div>
      </section>

      <!-- その他の設定（将来用） -->
      <section class="settings-section">
        <h2>通知設定</h2>
        <p class="coming-soon">Coming Soon - 通知設定は今後実装予定です</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  margin-bottom: 1.5rem;
}

.back-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 0.5rem;
}

.back-btn:hover {
  color: #1a1a2e;
}

.page-header h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.settings-section h2 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.section-description {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 1rem 0;
}

.profile-card {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 2rem;
  color: white;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #666;
  text-transform: uppercase;
}

.form-group input {
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9375rem;
}

.form-group input:focus {
  outline: none;
  border-color: #4cc9f0;
}

.info-value {
  font-size: 0.9375rem;
  color: #1a1a2e;
}

.info-value.readonly {
  color: #666;
}

.help-text {
  font-size: 0.75rem;
  color: #999;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.avatar-preview {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.preview-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.25rem;
  color: white;
}

.preview-name {
  font-size: 0.9375rem;
  color: #1a1a2e;
}

.coming-soon {
  color: #999;
  font-style: italic;
  margin: 0;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}
</style>
