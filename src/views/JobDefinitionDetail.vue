<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useGroupsStore } from '@/stores/groups'

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
  description: string | null
  category: string | null
  typical_start_month: number | null
  typical_duration_days: number | null
  is_active: boolean
  templates: TaskTemplate[]
}

const job = ref<JobDefinition | null>(null)
const members = ref<Member[]>([])
const isLoading = ref(true)
const showAddTemplateModal = ref(false)
const showInstantiateModal = ref(false)
const editingTemplate = ref<TaskTemplate | null>(null)

const newTemplate = ref({
  title: '',
  description: '',
  relative_days: 0,
  parent_template_id: '',
  default_assignee_ids: [] as string[],
  sort_order: 0,
})

const editingTemplateData = ref({
  id: '',
  title: '',
  description: '',
  relative_days: 0,
  default_assignee_ids: [] as string[],
  sort_order: 0,
})
const showEditTemplateModal = ref(false)

const instantiateForm = ref({
  fiscal_year: new Date().getFullYear(),
  actual_start: new Date().toISOString().split('T')[0],
})

const monthNames = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
]

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

async function addTemplate() {
  if (!newTemplate.value.title.trim()) return

  try {
    const res = await fetch(`/api/job-definitions/${jobId.value}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTemplate.value.title.trim(),
        description: newTemplate.value.description || null,
        relative_days: newTemplate.value.relative_days,
        parent_template_id: newTemplate.value.parent_template_id || null,
        default_assignee_ids: newTemplate.value.default_assignee_ids.length > 0 ? newTemplate.value.default_assignee_ids : null,
        sort_order: newTemplate.value.sort_order,
      }),
    })

    if (res.ok) {
      await fetchJob()
      closeTemplateModal()
    } else {
      const err = await res.json()
      alert(err.error || 'タスク追加に失敗しました')
    }
  } catch (error) {
    console.error('Failed to add template:', error)
  }
}

async function deleteTemplate(template: TaskTemplate) {
  if (!confirm(`「${template.title}」を削除しますか？`)) return

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

async function instantiateJob() {
  if (!userStore.currentUser) return

  try {
    const res = await fetch(`/api/job-definitions/${jobId.value}/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscal_year: instantiateForm.value.fiscal_year,
        actual_start: instantiateForm.value.actual_start,
        created_by: userStore.currentUser.id,
      }),
    })

    if (res.ok) {
      const instance = await res.json()
      alert(`${instance.task_count}件のタスクが作成されました`)
      showInstantiateModal.value = false
      // slugがあれば新URL形式
      if (resolvedGroupSlug.value) {
        router.push(`/${resolvedGroupSlug.value}/job-instances`)
      } else {
        router.push(`/groups/${resolvedGroupId.value}/job-instances`)
      }
    } else {
      const err = await res.json()
      alert(err.error || 'インスタンス化に失敗しました')
    }
  } catch (error) {
    console.error('Failed to instantiate:', error)
  }
}

function openAddTemplateModal(parentId: string = '') {
  newTemplate.value = {
    title: '',
    description: '',
    relative_days: 0,
    parent_template_id: parentId,
    default_assignee_ids: [],
    sort_order: (job.value?.templates.length || 0) + 1,
  }
  editingTemplate.value = null
  showAddTemplateModal.value = true
}

function closeTemplateModal() {
  showAddTemplateModal.value = false
  editingTemplate.value = null
  newTemplate.value = {
    title: '',
    description: '',
    relative_days: 0,
    parent_template_id: '',
    default_assignee_ids: [],
    sort_order: 0,
  }
}

function goBack() {
  if (resolvedGroupSlug.value) {
    router.push(`/${resolvedGroupSlug.value}/job-definitions`)
  } else {
    router.push(`/groups/${resolvedGroupId.value}/job-definitions`)
  }
}

function openEditTemplateModal(template: TaskTemplate) {
  // default_assignee_ids がJSON文字列の場合はパース
  let assigneeIds: string[] = []
  if (template.default_assignee_ids) {
    assigneeIds = template.default_assignee_ids
  } else if (template.default_assignee_id) {
    assigneeIds = [template.default_assignee_id]
  }

  editingTemplateData.value = {
    id: template.id,
    title: template.title,
    description: template.description || '',
    relative_days: template.relative_days,
    default_assignee_ids: assigneeIds,
    sort_order: template.sort_order,
  }
  showEditTemplateModal.value = true
}

async function updateTemplate() {
  if (!editingTemplateData.value.title.trim()) return

  try {
    const res = await fetch(`/api/job-definitions/templates/${editingTemplateData.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editingTemplateData.value.title.trim(),
        description: editingTemplateData.value.description || null,
        relative_days: editingTemplateData.value.relative_days,
        default_assignee_ids: editingTemplateData.value.default_assignee_ids.length > 0 ? editingTemplateData.value.default_assignee_ids : null,
        sort_order: editingTemplateData.value.sort_order,
      }),
    })

    if (res.ok) {
      await fetchJob()
      showEditTemplateModal.value = false
    } else {
      const err = await res.json()
      alert(err.error || '更新に失敗しました')
    }
  } catch (error) {
    console.error('Failed to update template:', error)
  }
}

// 担当者名を取得（複数対応）
function getAssigneeNames(template: TaskTemplate): string[] {
  const names: string[] = []
  if (template.default_assignee_ids && template.default_assignee_ids.length > 0) {
    for (const id of template.default_assignee_ids) {
      const member = members.value.find(m => m.id === id)
      if (member) names.push(member.name)
    }
  } else if (template.default_assignee_id) {
    const member = members.value.find(m => m.id === template.default_assignee_id)
    if (member) names.push(member.name)
  }
  return names
}

// テンプレートをツリー構造で表示用に整形
const templateTree = computed(() => {
  if (!job.value?.templates) return []

  const templates = job.value.templates
  const roots = templates.filter(t => !t.parent_template_id)

  function buildTree(parent: TaskTemplate): any {
    const children = templates.filter(t => t.parent_template_id === parent.id)
    return {
      ...parent,
      children: children.map(buildTree)
    }
  }

  return roots.map(buildTree)
})

// jobが取得されたらmembersを取得
watch(job, (newJob) => {
  if (newJob) {
    fetchMembers()
  }
})

onMounted(() => {
  fetchJob()
  // groupIdが既にある場合は先にmembersも取得
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
          <h1>{{ job.name }}</h1>
          <span v-if="job.category" class="category-badge">{{ job.category }}</span>
          <span class="status-badge" :class="{ active: job.is_active }">
            {{ job.is_active ? '有効' : '無効' }}
          </span>
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
        </div>
      </div>

      <!-- タスク一覧 -->
      <div class="templates-section">
        <div class="section-header">
          <h2>含まれるタスク</h2>
          <button class="btn btn-primary btn-sm" @click="openAddTemplateModal()">
            + タスク追加
          </button>
        </div>

        <div v-if="templateTree.length === 0" class="empty-templates">
          <p>タスクがありません</p>
          <p class="hint">タスクを追加して、業務を実行した際に自動でタスクが作成されるようにしましょう</p>
        </div>

        <div v-else class="template-list">
          <template v-for="template in templateTree" :key="template.id">
            <div class="template-item depth-0">
              <div class="template-main">
                <div class="template-content">
                  <span class="template-title">{{ template.title }}</span>
                  <span v-if="template.description" class="template-desc">{{ template.description }}</span>
                  <div class="template-meta">
                    <span class="template-timing">+{{ template.relative_days }}日</span>
                    <span
                      v-for="name in getAssigneeNames(template)"
                      :key="name"
                      class="template-assignee"
                    >
                      {{ name }}
                    </span>
                  </div>
                </div>
                <div class="template-actions">
                  <button class="btn btn-sm btn-secondary" @click="openEditTemplateModal(template)">
                    編集
                  </button>
                  <button class="btn btn-sm btn-secondary" @click="openAddTemplateModal(template.id)">
                    子タスク
                  </button>
                  <button class="btn btn-sm btn-danger" @click="deleteTemplate(template)">
                    削除
                  </button>
                </div>
              </div>

              <!-- 子テンプレート -->
              <div v-if="template.children?.length" class="children-templates">
                <template v-for="child in template.children" :key="child.id">
                  <div class="template-item depth-1">
                    <div class="template-main">
                      <div class="template-content">
                        <span class="template-title">{{ child.title }}</span>
                        <span v-if="child.description" class="template-desc">{{ child.description }}</span>
                        <div class="template-meta">
                          <span class="template-timing">+{{ child.relative_days }}日</span>
                          <span
                            v-for="name in getAssigneeNames(child)"
                            :key="name"
                            class="template-assignee"
                          >
                            {{ name }}
                          </span>
                        </div>
                      </div>
                      <div class="template-actions">
                        <button class="btn btn-sm btn-secondary" @click="openEditTemplateModal(child)">
                          編集
                        </button>
                        <button class="btn btn-sm btn-secondary" @click="openAddTemplateModal(child.id)">
                          子タスク
                        </button>
                        <button class="btn btn-sm btn-danger" @click="deleteTemplate(child)">
                          削除
                        </button>
                      </div>
                    </div>

                    <!-- 孫テンプレート -->
                    <div v-if="child.children?.length" class="children-templates">
                      <div
                        v-for="grandchild in child.children"
                        :key="grandchild.id"
                        class="template-item depth-2"
                      >
                        <div class="template-main">
                          <div class="template-content">
                            <span class="template-title">{{ grandchild.title }}</span>
                            <span v-if="grandchild.description" class="template-desc">{{ grandchild.description }}</span>
                            <div class="template-meta">
                              <span class="template-timing">+{{ grandchild.relative_days }}日</span>
                              <span
                                v-for="name in getAssigneeNames(grandchild)"
                                :key="name"
                                class="template-assignee"
                              >
                                {{ name }}
                              </span>
                            </div>
                          </div>
                          <div class="template-actions">
                            <button class="btn btn-sm btn-secondary" @click="openEditTemplateModal(grandchild)">
                              編集
                            </button>
                            <button class="btn btn-sm btn-danger" @click="deleteTemplate(grandchild)">
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- タスク追加モーダル -->
    <div v-if="showAddTemplateModal" class="modal-overlay" @click.self="closeTemplateModal">
      <div class="modal">
        <h2>タスクを追加</h2>

        <div class="form-group">
          <label>タスク名 *</label>
          <input
            v-model="newTemplate.title"
            type="text"
            placeholder="例: 書類準備"
          />
        </div>

        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="newTemplate.description"
            rows="2"
            placeholder="タスクの詳細説明"
          ></textarea>
        </div>

        <div class="form-group">
          <label>期限（業務開始から何日後）</label>
          <input
            v-model.number="newTemplate.relative_days"
            type="number"
            min="0"
            class="input-small"
          />
        </div>

        <div class="form-group">
          <label>担当者（複数選択可）</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input
                type="checkbox"
                :value="member.id"
                v-model="newTemplate.default_assignee_ids"
              />
              {{ member.name }}
            </label>
          </div>
        </div>

        <div v-if="newTemplate.parent_template_id" class="form-group">
          <label>親タスク</label>
          <span class="parent-info">
            {{ job?.templates.find(t => t.id === newTemplate.parent_template_id)?.title }}
          </span>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeTemplateModal">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="addTemplate">
            追加
          </button>
        </div>
      </div>
    </div>

    <!-- インスタンス化モーダル -->
    <div v-if="showInstantiateModal" class="modal-overlay" @click.self="showInstantiateModal = false">
      <div class="modal">
        <h2>タスクを生成</h2>
        <p class="modal-description">
          この業務定義からタスクを一括生成します。
          {{ job?.templates.length }}件のタスクが作成されます。
        </p>

        <div class="form-row">
          <div class="form-group">
            <label>年度</label>
            <input
              v-model.number="instantiateForm.fiscal_year"
              type="number"
              min="2020"
              max="2100"
            />
          </div>
          <div class="form-group">
            <label>開始日</label>
            <input
              v-model="instantiateForm.actual_start"
              type="date"
            />
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showInstantiateModal = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="instantiateJob">
            生成
          </button>
        </div>
      </div>
    </div>

    <!-- タスク編集モーダル -->
    <div v-if="showEditTemplateModal" class="modal-overlay" @click.self="showEditTemplateModal = false">
      <div class="modal">
        <h2>タスクを編集</h2>

        <div class="form-group">
          <label>タスク名 *</label>
          <input
            v-model="editingTemplateData.title"
            type="text"
            placeholder="例: 書類準備"
          />
        </div>

        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="editingTemplateData.description"
            rows="2"
            placeholder="タスクの詳細説明"
          ></textarea>
        </div>

        <div class="form-group">
          <label>期限（業務開始から何日後）</label>
          <input
            v-model.number="editingTemplateData.relative_days"
            type="number"
            min="0"
            class="input-small"
          />
        </div>

        <div class="form-group">
          <label>担当者（複数選択可）</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input
                type="checkbox"
                :value="member.id"
                v-model="editingTemplateData.default_assignee_ids"
              />
              {{ member.name }}
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showEditTemplateModal = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="updateTemplate">
            保存
          </button>
        </div>
      </div>
    </div>
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
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.job-header h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0;
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

.templates-section {
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

.section-header h2 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.empty-templates {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty-templates .hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.5rem;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.template-item {
  border-radius: 8px;
  overflow: hidden;
}

.template-item.depth-0 {
  background: #f8f9fa;
}

.template-item.depth-1 {
  background: #fff;
  border: 1px solid #e0e0e0;
  margin-left: 1.5rem;
}

.template-item.depth-2 {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  margin-left: 1.5rem;
}

.template-main {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
}

.template-order {
  font-size: 0.75rem;
  font-weight: 600;
  color: #999;
  background: #e0e0e0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.template-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.template-title {
  font-weight: 500;
  color: #1a1a2e;
}

.template-desc {
  font-size: 0.8125rem;
  color: #666;
}

.template-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.template-timing {
  font-size: 0.75rem;
  color: #999;
}

.template-assignee {
  font-size: 0.75rem;
  color: #4338ca;
  background: #e0e7ff;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.template-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.children-templates {
  padding-bottom: 0.5rem;
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
}

.modal h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.modal-description {
  color: #666;
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
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

.help-text {
  display: block;
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.25rem;
}

.parent-info {
  display: block;
  padding: 0.625rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #666;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.input-small {
  width: 100px !important;
}

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: white;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  margin-bottom: 0 !important;
}

.checkbox-item input {
  width: auto !important;
  margin: 0;
}
</style>
