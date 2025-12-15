<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  groupId: string
}>()

interface GroupStatus {
  id: string
  group_id: string
  key: string
  label: string
  color: string
  sort_order: number
  is_done: number
}

const statuses = ref<GroupStatus[]>([])
const showAddModal = ref(false)
const editingStatus = ref<GroupStatus | null>(null)
const newStatus = ref({
  key: '',
  label: '',
  color: '#6b7280',
  is_done: false,
})

async function fetchStatuses() {
  try {
    const res = await fetch(`/api/groups/${props.groupId}/statuses`)
    if (res.ok) {
      statuses.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch statuses:', error)
  }
}

async function addStatus() {
  if (!newStatus.value.key.trim() || !newStatus.value.label.trim()) return

  try {
    const res = await fetch(`/api/groups/${props.groupId}/statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStatus.value),
    })
    if (res.ok) {
      await fetchStatuses()
      showAddModal.value = false
      newStatus.value = { key: '', label: '', color: '#6b7280', is_done: false }
    } else {
      const err = await res.json()
      alert(err.error || 'ステータス追加に失敗しました')
    }
  } catch (error) {
    console.error('Failed to add status:', error)
  }
}

async function updateStatus(status: GroupStatus) {
  try {
    const res = await fetch(`/api/groups/${props.groupId}/statuses/${status.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: status.label,
        color: status.color,
        is_done: status.is_done,
      }),
    })
    if (res.ok) {
      editingStatus.value = null
      await fetchStatuses()
    }
  } catch (error) {
    console.error('Failed to update status:', error)
  }
}

async function deleteStatus(status: GroupStatus) {
  if (!confirm(`ステータス「${status.label}」を削除しますか？`)) return

  try {
    const res = await fetch(`/api/groups/${props.groupId}/statuses/${status.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await fetchStatuses()
    } else {
      const err = await res.json()
      alert(err.error || 'ステータス削除に失敗しました')
    }
  } catch (error) {
    console.error('Failed to delete status:', error)
  }
}

onMounted(() => {
  fetchStatuses()
})
</script>

<template>
  <section class="settings-section">
    <div class="section-header">
      <h3>タスクステータス</h3>
      <button class="btn btn-primary" @click="showAddModal = true">
        + ステータス追加
      </button>
    </div>
    <p class="section-description">カンバンの列やタスクのステータスをカスタマイズできます。</p>

    <div class="status-list">
      <div
        v-for="status in statuses"
        :key="status.id"
        class="status-row"
      >
        <div class="status-color" :style="{ background: status.color }"></div>
        <div class="status-info">
          <template v-if="editingStatus?.id === status.id">
            <input
              v-model="editingStatus.label"
              type="text"
              class="status-label-input"
            />
          </template>
          <template v-else>
            <span class="status-label">{{ status.label }}</span>
            <span class="status-key">{{ status.key }}</span>
          </template>
        </div>
        <div class="status-badges">
          <span v-if="status.is_done" class="done-badge">完了扱い</span>
        </div>
        <div class="status-actions">
          <template v-if="editingStatus?.id === status.id">
            <input
              v-model="editingStatus.color"
              type="color"
              class="color-input"
            />
            <label class="done-checkbox">
              <input
                type="checkbox"
                :checked="editingStatus.is_done"
                @change="editingStatus.is_done = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              完了
            </label>
            <button class="btn btn-sm btn-primary" @click="updateStatus(editingStatus)">
              保存
            </button>
            <button class="btn btn-sm btn-secondary" @click="editingStatus = null">
              キャンセル
            </button>
          </template>
          <template v-else>
            <button class="btn btn-sm btn-secondary" @click="editingStatus = { ...status }">
              編集
            </button>
            <button class="btn btn-sm btn-danger" @click="deleteStatus(status)">
              削除
            </button>
          </template>
        </div>
      </div>
    </div>
  </section>

  <!-- ステータス追加モーダル -->
  <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
    <div class="modal">
      <h2>ステータスを追加</h2>
      <div class="form-group">
        <label>キー *</label>
        <input
          v-model="newStatus.key"
          type="text"
          placeholder="review"
        />
        <p class="help-text">英小文字・アンダースコアのみ（例: review, waiting_approval）</p>
      </div>
      <div class="form-group">
        <label>表示名 *</label>
        <input
          v-model="newStatus.label"
          type="text"
          placeholder="レビュー中"
        />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>色</label>
          <input
            v-model="newStatus.color"
            type="color"
            class="color-input-large"
          />
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="newStatus.is_done"
              type="checkbox"
            />
            完了扱いにする
          </label>
          <p class="help-text">チェックすると進捗計算時に「完了」としてカウントされます</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showAddModal = false">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="addStatus">
          追加
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
  margin-bottom: 0.5rem;
}

.section-header h3 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.section-description {
  font-size: 0.8125rem;
  color: #666;
  margin: 0 0 1rem 0;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 8px;
}

.status-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.status-info {
  flex: 1;
  min-width: 0;
}

.status-label {
  font-weight: 500;
  color: #1a1a2e;
}

.status-key {
  font-size: 0.75rem;
  color: #999;
  margin-left: 0.5rem;
  font-family: monospace;
}

.status-label-input {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
  width: 150px;
}

.status-badges {
  display: flex;
  gap: 0.375rem;
}

.done-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: #dcfce7;
  color: #166534;
  border-radius: 4px;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.color-input {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.color-input-large {
  width: 48px;
  height: 36px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
}

.done-checkbox {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #666;
  cursor: pointer;
}

.done-checkbox input {
  width: auto;
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

.form-group input[type="text"] {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.form-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  align-items: start;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
}

.help-text {
  font-size: 0.75rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
