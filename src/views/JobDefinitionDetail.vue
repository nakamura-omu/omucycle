<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useGroupsStore } from '@/stores/groups'
import JobDefinitionEditModal from '@/components/job-definition/JobDefinitionEditModal.vue'
import TaskTemplateList from '@/components/job-definition/TaskTemplateList.vue'
import TaskTemplateModal from '@/components/job-definition/TaskTemplateModal.vue'
import InstantiateModal from '@/components/job-definition/InstantiateModal.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const groupsStore = useGroupsStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)
const jobId = computed(() => route.params.jobId as string)

// 解決されたグループID（slugの場合はjobから取得）
const resolvedGroupId = computed(() => {
  if (groupId.value) return groupId.value
  if (job.value?.group_id) return job.value.group_id
  return groupsStore.currentGroup?.id || ''
})

// 解決されたグループslug
const resolvedGroupSlug = computed(() => {
  if (groupSlug.value) return groupSlug.value
  return groupsStore.currentGroup?.slug || null
})

interface TaskTemplate {
  id: string
  title: string
  description: string | null
  relative_days: number
  default_assignee_role: string | null
  default_assignee_id: string | null
  default_assignee_ids: string[] | null
  sort_order: number
  depth: number
  parent_template_id: string | null
}

interface Member {
  id: string
  name: string
  email: string
  role: string
}

interface JobDefinition {
  id: string
  group_id: string
  name: string
  prefix: string | null
  description: string | null
  category: string | null
  typical_start_month: number | null
  typical_duration_days: number | null
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  templates: TaskTemplate[]
}

const job = ref<JobDefinition | null>(null)
const members = ref<Member[]>([])
const isLoading = ref(true)

// モーダル状態
const showEditJobModal = ref(false)
const showTemplateModal = ref(false)
const showInstantiateModal = ref(false)
const templateModalMode = ref<'add' | 'edit'>('add')
const editingTemplate = ref<TaskTemplate | null>(null)
const parentTemplateId = ref<string>('')

const monthNames = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
]

// 親テンプレート名
const parentTemplateName = computed(() => {
  if (!parentTemplateId.value || !job.value?.templates) return ''
  const parent = job.value.templates.find(t => t.id === parentTemplateId.value)
  return parent?.title || ''
})

async function fetchJob() {
  isLoading.value = true
  try {
    const res = await fetch(`/api/job-definitions/${jobId.value}`)
    if (res.ok) {
      job.value = await res.json()
    } else {
      goBack()
    }
  } catch (error) {
    console.error('Failed to fetch job definition:', error)
  } finally {
    isLoading.value = false
  }
}

async function fetchMembers() {
  if (!resolvedGroupId.value) return
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/members`)
    if (res.ok) {
      members.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

async function deleteTemplate(template: TaskTemplate) {
  try {
    const res = await fetch(`/api/job-definitions/templates/${template.id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      await fetchJob()
    } else {
      const err = await res.json()
      alert(err.error || '削除に失敗しました')
    }
  } catch (error) {
    console.error('Failed to delete template:', error)
  }
}

function goBack() {
  if (resolvedGroupSlug.value) {
    router.push(`/${resolvedGroupSlug.value}/job-definitions`)
  } else {
    router.push(`/groups/${resolvedGroupId.value}/job-definitions`)
  }
}

function openAddTemplateModal(parentId?: string) {
  templateModalMode.value = 'add'
  editingTemplate.value = null
  parentTemplateId.value = parentId || ''
  showTemplateModal.value = true
}

function openEditTemplateModal(template: TaskTemplate) {
  templateModalMode.value = 'edit'
  editingTemplate.value = template
  parentTemplateId.value = ''
  showTemplateModal.value = true
}

function handleInstanceCreated(instance: { id: string; task_count: number }) {
  alert(`${instance.task_count}件のタスクが作成されました`)
  if (resolvedGroupSlug.value) {
    router.push(`/${resolvedGroupSlug.value}/job-instances`)
  } else {
    router.push(`/groups/${resolvedGroupId.value}/job-instances`)
  }
}

// jobが取得されたらmembersを取得
watch(job, (newJob) => {
  if (newJob) {
    fetchMembers()
  }
})

onMounted(() => {
  fetchJob()
  if (groupId.value) {
    fetchMembers()
  }
})
</script>

<template>
  <div class="job-detail-page">
    <div class="page-header">
      <button class="back-btn" @click="goBack">← 業務一覧</button>
      <div v-if="job" class="header-actions">
        <button
          class="btn btn-primary"
          @click="showInstantiateModal = true"
          :disabled="!job.templates.length"
        >
          タスクを生成
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <template v-else-if="job">
      <!-- 業務定義情報 -->
      <div class="job-info-card">
        <div class="job-header">
          <div class="job-title-row">
            <h1>{{ job.name }}</h1>
            <span v-if="job.prefix" class="prefix-badge">{{ job.prefix }}</span>
            <span v-if="job.category" class="category-badge">{{ job.category }}</span>
            <span class="status-badge" :class="{ active: job.is_active }">
              {{ job.is_active ? '有効' : '無効' }}
            </span>
          </div>
          <button class="btn btn-secondary btn-sm" @click="showEditJobModal = true">
            編集
          </button>
        </div>

        <p v-if="job.description" class="job-description">{{ job.description }}</p>

        <div class="job-meta">
          <div v-if="job.typical_start_month" class="meta-item">
            <span class="meta-label">開始月</span>
            <span class="meta-value">{{ monthNames[job.typical_start_month - 1] }}</span>
          </div>
          <div v-if="job.typical_duration_days" class="meta-item">
            <span class="meta-label">期間</span>
            <span class="meta-value">{{ job.typical_duration_days }}日</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">タスク数</span>
            <span class="meta-value">{{ job.templates.length }}件</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">利用回数</span>
            <span class="meta-value">{{ job.usage_count || 0 }}回</span>
          </div>
          <div v-if="job.last_used_at" class="meta-item">
            <span class="meta-label">前回利用</span>
            <span class="meta-value">{{ new Date(job.last_used_at).toLocaleDateString('ja-JP') }}</span>
          </div>
        </div>
      </div>

      <!-- タスク一覧 -->
      <TaskTemplateList
        :templates="job.templates"
        :members="members"
        @add="openAddTemplateModal"
        @edit="openEditTemplateModal"
        @delete="deleteTemplate"
      />
    </template>

    <!-- 業務定義編集モーダル -->
    <JobDefinitionEditModal
      v-model="showEditJobModal"
      :job="job"
      :current-user-id="userStore.currentUser?.id"
      @saved="fetchJob"
    />

    <!-- タスクテンプレートモーダル -->
    <TaskTemplateModal
      v-model="showTemplateModal"
      :mode="templateModalMode"
      :job-id="jobId"
      :template="editingTemplate"
      :parent-template-id="parentTemplateId"
      :parent-template-name="parentTemplateName"
      :members="members"
      :template-count="job?.templates.length || 0"
      @saved="fetchJob"
    />

    <!-- インスタンス化モーダル -->
    <InstantiateModal
      v-if="job && userStore.currentUser"
      v-model="showInstantiateModal"
      :job-id="jobId"
      :template-count="job.templates.length"
      :current-user-id="userStore.currentUser.id"
      @created="handleInstanceCreated"
    />
  </div>
</template>

<style scoped>
.job-detail-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.back-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
}

.back-btn:hover {
  color: #1a1a2e;
}

.loading {
  text-align: center;
  color: #666;
  padding: 2rem;
}

.job-info-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.job-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.job-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.job-header h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0;
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

.category-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #e0e7ff;
  color: #4338ca;
  border-radius: 4px;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 4px;
}

.status-badge.active {
  background: #dcfce7;
  color: #166534;
}

.job-description {
  color: #666;
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.job-meta {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
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
  font-size: 0.9375rem;
  color: #333;
  font-weight: 500;
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
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
