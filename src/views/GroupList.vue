<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const groupsStore = useGroupsStore()
const userStore = useUserStore()

const showCreateModal = ref(false)
const newGroupName = ref('')

onMounted(() => {
  groupsStore.fetchGroups()
})

function openGroup(group: typeof groupsStore.groups[0]) {
  // slugがあればslugベースのURL、なければUUIDベースのURL
  if (group.slug) {
    router.push(`/${group.slug}`)
  } else {
    router.push(`/groups/${group.id}`)
  }
}

async function createGroup() {
  if (!newGroupName.value.trim() || !userStore.currentUser) return

  try {
    const group = await groupsStore.createGroup(
      newGroupName.value.trim(),
      userStore.currentUser.id
    )
    showCreateModal.value = false
    newGroupName.value = ''
    router.push(`/groups/${group.id}`)
  } catch (error) {
    console.error('Failed to create group:', error)
  }
}
</script>

<template>
  <div class="group-list-page">
    <div class="page-header">
      <h1>グループ一覧</h1>
      <button class="btn btn-primary" @click="showCreateModal = true">
        + グループ作成
      </button>
    </div>

    <div v-if="groupsStore.isLoading" class="loading">
      読み込み中...
    </div>

    <div v-else class="groups-grid">
      <div
        v-for="group in groupsStore.groups"
        :key="group.id"
        class="group-card"
        @click="openGroup(group)"
      >
        <div class="group-icon">📁</div>
        <div class="group-info">
          <h3 class="group-name">{{ group.name }}</h3>
          <div class="group-meta">
            <span>{{ group.member_count }}人</span>
            <span>{{ group.active_tasks }}件進行中</span>
          </div>
        </div>
      </div>
    </div>

    <!-- グループ作成モーダル -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h2>新しいグループを作成</h2>
        <div class="form-group">
          <label>グループ名</label>
          <input
            v-model="newGroupName"
            type="text"
            placeholder="例: DX推進課"
            @keyup.enter="createGroup"
          />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreateModal = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="createGroup">
            作成
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-list-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0;
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.group-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.group-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.group-icon {
  font-size: 2rem;
}

.group-info {
  flex: 1;
}

.group-name {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 0.25rem 0;
}

.group-meta {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  gap: 0.75rem;
}

.loading {
  text-align: center;
  color: #666;
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
  transition: opacity 0.15s;
}

.btn:hover {
  opacity: 0.9;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
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
  color: #1a1a2e;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.form-group input:focus {
  outline: none;
  border-color: #4cc9f0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
