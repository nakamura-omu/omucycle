<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)

// 解決されたグループID（slugの場合はstoreから取得）
const resolvedGroupId = computed(() => {
  if (groupId.value) return groupId.value
  return groupsStore.currentGroup?.id || ''
})

// グループslug（直接またはstoreから取得）
const resolvedGroupSlug = computed(() => {
  if (groupSlug.value) return groupSlug.value
  return groupsStore.currentGroup?.slug || null
})

interface TaskTemplate {
  id: string
  title: string
  description: string | null
  relative_start_days: number
  relative_due_days: number
  default_priority: string
  order_index: number
}

interface JobDefinition {
  id: string
  group_id: string
  name: string
  prefix: string | null
  description: string | null
  typical_start_month: number
  typical_end_month: number
  recurrence_type: string
  is_active: boolean
  template_count: number
  instance_count: number
  created_at: string
  task_templates?: TaskTemplate[]
}

const jobDefinitions = ref<JobDefinition[]>([])
const showCreateModal = ref(false)
const isLoading = ref(false)

const newJob = ref({
  name: '',
  prefix: '',
  description: '',
  typical_start_month: 4,
  typical_end_month: 3,
  recurrence_type: 'yearly',
})

const monthNames = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
]

const recurrenceLabels: Record<string, string> = {
  yearly: '年次',
  monthly: '月次',
  quarterly: '四半期',
  one_time: '単発',
}

async function fetchJobDefinitions() {
  isLoading.value = true
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-definitions`)
    if (res.ok) {
      jobDefinitions.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch job definitions:', error)
  } finally {
    isLoading.value = false
  }
}

async function createJobDefinition() {
  if (!newJob.value.name.trim()) return

  try {
    const res = await fetch('/api/job-definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: resolvedGroupId.value,
        ...newJob.value,
      }),
    })

    if (res.ok) {
      await fetchJobDefinitions()
      showCreateModal.value = false
      newJob.value = {
        name: '',
        prefix: '',
        description: '',
        typical_start_month: 4,
        typical_end_month: 3,
        recurrence_type: 'yearly',
      }
    }
  } catch (error) {
    console.error('Failed to create job definition:', error)
  }
}

function goToJobDetail(job: JobDefinition) {
  // slugがあれば新URL形式を使用
  if (resolvedGroupSlug.value) {
    router.push(`/${resolvedGroupSlug.value}/job-definitions/${job.id}`)
  } else {
    router.push(`/groups/${resolvedGroupId.value}/job-definitions/${job.id}`)
  }
}

async function toggleActive(job: JobDefinition) {
  try {
    const res = await fetch(`/api/job-definitions/${job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !job.is_active }),
    })

    if (res.ok) {
      await fetchJobDefinitions()
    }
  } catch (error) {
    console.error('Failed to toggle job status:', error)
  }
}

async function deleteJobDefinition(job: JobDefinition) {
  if (!confirm(`「${job.name}」を削除しますか？この操作は取り消せません。`)) return

  try {
    const res = await fetch(`/api/job-definitions/${job.id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      await fetchJobDefinitions()
    }
  } catch (error) {
    console.error('Failed to delete job definition:', error)
  }
}

function getMonthRange(start: number, end: number): string {
  if (start === end) {
    return monthNames[start - 1] || ''
  }
  return `${monthNames[start - 1] || ''} 〜 ${monthNames[end - 1] || ''}`
}

onMounted(() => {
  fetchJobDefinitions()
})
</script>

<template>
  <div class="job-definition-page">
    <div class="page-header">
      <h2>業務定義</h2>
      <button class="btn btn-primary" @click="showCreateModal = true">
        + 業務定義を作成
      </button>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <div v-else-if="jobDefinitions.length === 0" class="empty-state">
      <span class="empty-icon">📖</span>
      <h3>業務定義がありません</h3>
      <p>業務定義を作成して、繰り返しタスクをテンプレート化しましょう</p>
      <button class="btn btn-primary" @click="showCreateModal = true">
        業務定義を作成
      </button>
    </div>

    <div v-else class="job-list">
      <div
        v-for="job in jobDefinitions"
        :key="job.id"
        class="job-card"
        :class="{ inactive: !job.is_active }"
      >
        <div class="job-header">
          <h3 class="job-name" @click="goToJobDetail(job)">{{ job.name }}</h3>
          <span v-if="job.prefix" class="prefix-badge">{{ job.prefix }}</span>
          <span class="recurrence-badge">{{ recurrenceLabels[job.recurrence_type] }}</span>
        </div>

        <p v-if="job.description" class="job-description">{{ job.description }}</p>

        <div class="job-meta">
          <div class="meta-item">
            <span class="meta-label">期間</span>
            <span class="meta-value">{{ getMonthRange(job.typical_start_month, job.typical_end_month) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">タスク数</span>
            <span class="meta-value">{{ job.template_count }}件</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">実行履歴</span>
            <span class="meta-value">{{ job.instance_count }}回</span>
          </div>
        </div>

        <div class="job-actions">
          <button class="btn btn-secondary btn-sm" @click="goToJobDetail(job)">
            詳細・編集
          </button>
          <button
            class="btn btn-sm"
            :class="job.is_active ? 'btn-warning' : 'btn-success'"
            @click="toggleActive(job)"
          >
            {{ job.is_active ? '無効化' : '有効化' }}
          </button>
          <button class="btn btn-danger btn-sm" @click="deleteJobDefinition(job)">
            削除
          </button>
        </div>
      </div>
    </div>

    <!-- 作成モーダル -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h2>業務定義を作成</h2>

        <div class="form-group">
          <label>業務名 *</label>
          <input
            v-model="newJob.name"
            type="text"
            placeholder="例: 年度末決算業務"
          />
        </div>

        <div class="form-group">
          <label>URL用プレフィックス</label>
          <input
            v-model="newJob.prefix"
            type="text"
            placeholder="例: KESSAN"
            class="prefix-input"
          />
          <p class="help-text">大文字英字のみ。URLで /グループ/KESSAN-1 のように使われます</p>
        </div>

        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="newJob.description"
            rows="3"
            placeholder="業務の概要を入力"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>開始月</label>
            <select v-model="newJob.typical_start_month">
              <option v-for="(name, index) in monthNames" :key="index" :value="index + 1">
                {{ name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>終了月</label>
            <select v-model="newJob.typical_end_month">
              <option v-for="(name, index) in monthNames" :key="index" :value="index + 1">
                {{ name }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>繰り返し</label>
          <select v-model="newJob.recurrence_type">
            <option value="yearly">年次</option>
            <option value="quarterly">四半期</option>
            <option value="monthly">月次</option>
            <option value="one_time">単発</option>
          </select>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreateModal = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="createJobDefinition">
            作成
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.job-definition-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.25rem;
  color: #1a1a2e;
  margin: 0;
}

.loading {
  text-align: center;
  color: #666;
  padding: 2rem;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem 0;
  color: #1a1a2e;
}

.empty-state p {
  color: #666;
  margin: 0 0 1.5rem 0;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.job-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.job-card.inactive {
  opacity: 0.6;
}

.job-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.job-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
  cursor: pointer;
}

.job-name:hover {
  color: #4cc9f0;
}

.prefix-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 600;
}

.recurrence-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #e0e7ff;
  color: #4338ca;
  border-radius: 4px;
}

.prefix-input {
  text-transform: uppercase;
  font-family: monospace;
}

.help-text {
  font-size: 0.75rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.job-description {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.job-meta {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.meta-label {
  font-size: 0.7rem;
  color: #999;
  text-transform: uppercase;
}

.meta-value {
  font-size: 0.875rem;
  color: #333;
}

.job-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

/* 詳細モーダル */
.modal-large {
  max-width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h2 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0;
  line-height: 1;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-section h3 {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 0.75rem 0;
  text-transform: uppercase;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.detail-label {
  font-size: 0.7rem;
  color: #999;
}

.detail-value {
  font-size: 0.875rem;
  color: #333;
}

.detail-value.active {
  color: #22c55e;
}

.detail-value.inactive {
  color: #ef4444;
}

.detail-description {
  font-size: 0.875rem;
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-count {
  font-size: 0.75rem;
  color: #999;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.template-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.template-order {
  width: 24px;
  height: 24px;
  background: #e0e0e0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #666;
  flex-shrink: 0;
}

.template-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.template-title {
  font-size: 0.875rem;
  color: #333;
}

.template-timing {
  font-size: 0.75rem;
  color: #999;
}

.priority-badge {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: #e0e0e0;
}

.priority-badge[data-priority="urgent"] {
  background: #fee2e2;
  color: #dc2626;
}

.priority-badge[data-priority="important"] {
  background: #fef3c7;
  color: #d97706;
}

.no-templates {
  text-align: center;
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.no-templates p {
  margin: 0;
  color: #666;
}

.no-templates .hint {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.5rem;
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

.btn-success {
  background: #dcfce7;
  color: #166534;
}

.btn-warning {
  background: #fef3c7;
  color: #92400e;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
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
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
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

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
