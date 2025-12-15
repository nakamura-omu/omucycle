<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'
import JobInstancePane, { type JobInstance } from '@/components/job-workspace/JobInstancePane.vue'
import TaskPane, { type Task, type Member } from '@/components/job-workspace/TaskPane.vue'
import TaskDetailPanel, { type GroupStatus } from '@/components/job-workspace/TaskDetailPanel.vue'

const route = useRoute()
const groupsStore = useGroupsStore()
const userStore = useUserStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)

// === 状態 ===
const instances = ref<JobInstance[]>([])
const selectedInstance = ref<JobInstance | null>(null)
const tasks = ref<Task[]>([])
const selectedTask = ref<Task | null>(null)
const members = ref<Member[]>([])
const statuses = ref<GroupStatus[]>([])
const isLoadingInstances = ref(false)
const isLoadingTasks = ref(false)

// モーダル状態
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showAddTaskModal = ref(false)
const showSaveTemplateModal = ref(false)

// フォーム
const newInstance = ref({
  name: '',
  fiscal_year: new Date().getFullYear(),
  actual_start: new Date().toISOString().split('T')[0],
})

const newTask = ref({
  title: '',
  description: '',
  due_date: '',
  priority: 'normal' as string,
  assignee_ids: [] as string[],
  parent_task_id: null as string | null,
})

const parentTaskForChild = ref<{ id: string; title: string } | null>(null)

const templateForm = ref({
  name: '',
  prefix: '',
  description: '',
})

const editInstance = ref({
  name: '',
  fiscal_year: new Date().getFullYear(),
  actual_start: '',
  status: 'not_started' as string,
})

// 完了ステータスのキー一覧
const doneStatusKeys = computed(() =>
  statuses.value.filter(s => s.is_done).map(s => s.key)
)

// === Computed ===
const resolvedGroupId = computed(() => {
  if (groupId.value) return groupId.value
  return groupsStore.currentGroup?.id || ''
})

const resolvedGroupSlug = computed(() => {
  if (groupSlug.value) return groupSlug.value
  return groupsStore.currentGroup?.slug || null
})

const jobDefinitionsLink = computed(() => {
  return resolvedGroupSlug.value
    ? `/${resolvedGroupSlug.value}/job-definitions`
    : `/groups/${resolvedGroupId.value}/job-definitions`
})

const currentUserId = computed(() => userStore.currentUser?.id || '')

// === API呼び出し ===
async function fetchInstances() {
  isLoadingInstances.value = true
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances`)
    if (res.ok) {
      instances.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch job instances:', error)
  } finally {
    isLoadingInstances.value = false
  }
}

async function fetchTasks(instance: JobInstance) {
  isLoadingTasks.value = true
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${instance.id}`)
    if (res.ok) {
      const data = await res.json()
      tasks.value = data.tasks || []
    }
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
  } finally {
    isLoadingTasks.value = false
  }
}

async function fetchMembers() {
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/members`)
    if (res.ok) {
      members.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

async function fetchStatuses() {
  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/statuses`)
    if (res.ok) {
      statuses.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch statuses:', error)
  }
}

// === アクション ===
function selectInstance(instance: JobInstance) {
  selectedInstance.value = instance
  selectedTask.value = null
  fetchTasks(instance)
}

function selectTask(task: Task) {
  selectedTask.value = { ...task }
}

function closeTaskPanel() {
  selectedTask.value = null
}

async function toggleTaskStatus(task: Task) {
  const isDone = doneStatusKeys.value.includes(task.status)
  const firstStatus = statuses.value[0]?.key || 'not_started'
  const firstDoneStatus = statuses.value.find(s => s.is_done)?.key || 'completed'
  const newStatus = isDone ? firstStatus : firstDoneStatus

  try {
    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      task.status = newStatus
      if (selectedTask.value?.id === task.id) {
        selectedTask.value.status = newStatus
      }
      // インスタンスの進捗更新
      if (selectedInstance.value) {
        if (!isDone) {
          selectedInstance.value.completed_count++
        } else {
          selectedInstance.value.completed_count--
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle task status:', error)
  }
}

function handleUpdateTask(taskId: string, field: string, value: any) {
  const idx = tasks.value.findIndex(t => t.id === taskId)
  if (idx !== -1) {
    ;(tasks.value[idx] as any)[field] = value
  }
}

function handleUpdateStatus(taskId: string, status: string) {
  const idx = tasks.value.findIndex(t => t.id === taskId)
  if (idx !== -1) {
    tasks.value[idx].status = status as Task['status']
  }
}

function handleUpdateProgress(_taskId: string, delta: number) {
  if (selectedInstance.value) {
    selectedInstance.value.completed_count += delta
  }
}

// === 業務インスタンス作成 ===
function openCreateModal() {
  newInstance.value = {
    name: '',
    fiscal_year: new Date().getFullYear(),
    actual_start: new Date().toISOString().split('T')[0],
  }
  showCreateModal.value = true
}

async function createInstance() {
  if (!newInstance.value.name.trim()) {
    alert('業務名を入力してください')
    return
  }

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newInstance.value.name.trim(),
        fiscal_year: newInstance.value.fiscal_year,
        actual_start: newInstance.value.actual_start || null,
        created_by: currentUserId.value,
      }),
    })

    if (res.ok) {
      const instance = await res.json()
      instances.value.unshift(instance)
      showCreateModal.value = false
      selectInstance(instance)
    } else {
      const err = await res.json()
      alert(err.error || '作成に失敗しました')
    }
  } catch (error) {
    console.error('Failed to create instance:', error)
  }
}

// === 業務インスタンス編集 ===
function openEditModal() {
  if (!selectedInstance.value) return
  editInstance.value = {
    name: selectedInstance.value.job_name || '',
    fiscal_year: selectedInstance.value.fiscal_year,
    actual_start: selectedInstance.value.actual_start || '',
    status: selectedInstance.value.status,
  }
  showEditModal.value = true
}

async function updateInstance() {
  if (!selectedInstance.value) return

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${selectedInstance.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editInstance.value.name.trim() || null,
        fiscal_year: editInstance.value.fiscal_year,
        actual_start: editInstance.value.actual_start || null,
        status: editInstance.value.status,
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      // 選択中のインスタンスを更新
      selectedInstance.value = { ...selectedInstance.value, ...updated }
      // 一覧も更新
      const idx = instances.value.findIndex(i => i.id === updated.id)
      if (idx !== -1) {
        instances.value[idx] = { ...instances.value[idx], ...updated }
      }
      showEditModal.value = false
    } else {
      const err = await res.json()
      alert(err.error || '更新に失敗しました')
    }
  } catch (error) {
    console.error('Failed to update instance:', error)
  }
}

async function deleteInstance() {
  if (!selectedInstance.value) return
  if (!confirm(`「${selectedInstance.value.job_name || '（名称なし）'}」を削除しますか？\nこの業務に含まれるタスクもすべて削除されます。`)) {
    return
  }

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${selectedInstance.value.id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      const deletedId = selectedInstance.value.id
      instances.value = instances.value.filter(i => i.id !== deletedId)
      selectedInstance.value = null
      tasks.value = []
      showEditModal.value = false
    } else {
      const err = await res.json()
      alert(err.error || '削除に失敗しました')
    }
  } catch (error) {
    console.error('Failed to delete instance:', error)
  }
}

// === タスク追加 ===
function openAddTaskModal() {
  parentTaskForChild.value = null
  newTask.value = {
    title: '',
    description: '',
    due_date: '',
    priority: 'normal',
    assignee_ids: [],
    parent_task_id: null,
  }
  showAddTaskModal.value = true
}

function openAddChildTaskModal(parentTask: { id: string; title: string; depth: number }) {
  if (parentTask.depth >= 2) return // 最大3階層
  parentTaskForChild.value = { id: parentTask.id, title: parentTask.title }
  newTask.value = {
    title: '',
    description: '',
    due_date: '',
    priority: 'normal',
    assignee_ids: [],
    parent_task_id: parentTask.id,
  }
  showAddTaskModal.value = true
}

async function addTask() {
  if (!selectedInstance.value || !newTask.value.title.trim()) {
    alert('タスク名を入力してください')
    return
  }

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${selectedInstance.value.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTask.value.title.trim(),
        description: newTask.value.description || null,
        due_date: newTask.value.due_date || null,
        priority: newTask.value.priority,
        assignee_ids: newTask.value.assignee_ids.length > 0 ? newTask.value.assignee_ids : null,
        parent_task_id: newTask.value.parent_task_id,
        created_by: currentUserId.value,
      }),
    })

    if (res.ok) {
      const task = await res.json()
      // 親タスクの後に挿入
      if (task.parent_task_id) {
        const parentIndex = tasks.value.findIndex(t => t.id === task.parent_task_id)
        if (parentIndex !== -1) {
          // 親の子タスクの最後に挿入
          let insertIndex = parentIndex + 1
          while (insertIndex < tasks.value.length && tasks.value[insertIndex].parent_task_id === task.parent_task_id) {
            insertIndex++
          }
          tasks.value.splice(insertIndex, 0, task)
        } else {
          tasks.value.push(task)
        }
      } else {
        tasks.value.push(task)
      }
      selectedInstance.value.task_count++
      showAddTaskModal.value = false
      parentTaskForChild.value = null
    } else {
      const err = await res.json()
      alert(err.error || 'タスク追加に失敗しました')
    }
  } catch (error) {
    console.error('Failed to add task:', error)
  }
}

// === テンプレート保存 ===
function openSaveTemplateModal() {
  if (!selectedInstance.value) return
  templateForm.value = {
    name: selectedInstance.value.job_name || '',
    prefix: '',
    description: '',
  }
  showSaveTemplateModal.value = true
}

async function saveAsTemplate() {
  if (!selectedInstance.value || !templateForm.value.name.trim()) {
    alert('テンプレート名を入力してください')
    return
  }

  try {
    const res = await fetch(`/api/groups/${resolvedGroupId.value}/job-instances/${selectedInstance.value.id}/save-as-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: templateForm.value.name.trim(),
        prefix: templateForm.value.prefix.trim().toUpperCase() || null,
        description: templateForm.value.description || null,
      }),
    })

    if (res.ok) {
      const jobDef = await res.json()
      alert(`テンプレート「${jobDef.name}」として保存しました（${jobDef.template_count}件のタスク）`)
      showSaveTemplateModal.value = false
      // インスタンス一覧を更新（job_definition_idが紐付けられるため）
      await fetchInstances()
    } else {
      const err = await res.json()
      alert(err.error || '保存に失敗しました')
    }
  } catch (error) {
    console.error('Failed to save as template:', error)
  }
}

// === タスク並び替え ===
function sortTasksHierarchically(taskList: Task[]): Task[] {
  // ルートタスク（親なし）をsort_orderでソート
  const roots = taskList
    .filter(t => !t.parent_task_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const result: Task[] = []

  // 再帰的に子タスクを追加
  function addWithChildren(task: Task) {
    result.push(task)
    const children = taskList
      .filter(t => t.parent_task_id === task.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    for (const child of children) {
      addWithChildren(child)
    }
  }

  for (const root of roots) {
    addWithChildren(root)
  }

  return result
}

async function handleReorderTasks(reorderedTasks: { id: string; sort_order: number; parent_task_id: string | null }[]) {
  if (!reorderedTasks || reorderedTasks.length === 0) {
    return
  }

  // 先にローカル状態を更新（楽観的更新）
  for (const rt of reorderedTasks) {
    const task = tasks.value.find(t => t.id === rt.id)
    if (task) {
      task.sort_order = rt.sort_order
      task.parent_task_id = rt.parent_task_id
      // 親に応じてdepthを再計算
      if (rt.parent_task_id) {
        const parent = tasks.value.find(t => t.id === rt.parent_task_id)
        task.depth = parent ? parent.depth + 1 : 0
      } else {
        task.depth = 0
      }
    }
  }

  // 階層順にソート
  tasks.value = sortTasksHierarchically(tasks.value)

  // バックグラウンドでAPIに保存
  try {
    const res = await fetch('/api/tasks/reorder-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: reorderedTasks }),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('Failed to reorder:', err)
    }
  } catch (error) {
    console.error('Failed to reorder tasks:', error)
  }
}

onMounted(async () => {
  await Promise.all([
    fetchInstances(),
    fetchMembers(),
    fetchStatuses(),
  ])
})
</script>

<template>
  <div class="job-workspace">
    <!-- 左ペイン: 業務インスタンス一覧 -->
    <JobInstancePane
      :instances="instances"
      :selected-id="selectedInstance?.id || null"
      :is-loading="isLoadingInstances"
      :job-definitions-link="jobDefinitionsLink"
      @select="selectInstance"
      @create="openCreateModal"
    />

    <!-- 中央ペイン: タスク一覧 -->
    <TaskPane
      :instance="selectedInstance"
      :tasks="tasks"
      :selected-task-id="selectedTask?.id || null"
      :members="members"
      :statuses="statuses"
      :is-loading="isLoadingTasks"
      @select-task="selectTask"
      @toggle-status="toggleTaskStatus"
      @add-task="openAddTaskModal"
      @add-child-task="openAddChildTaskModal"
      @save-template="openSaveTemplateModal"
      @edit-instance="openEditModal"
      @reorder-tasks="handleReorderTasks"
    />

    <!-- 右ペイン: タスク詳細パネル -->
    <transition name="slide">
      <TaskDetailPanel
        v-if="selectedTask"
        :task="selectedTask"
        :members="members"
        :current-user-id="currentUserId"
        :statuses="statuses"
        @close="closeTaskPanel"
        @update-task="handleUpdateTask"
        @update-status="handleUpdateStatus"
        @update-progress="handleUpdateProgress"
      />
    </transition>

    <!-- 業務作成モーダル -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h2>新しい業務を作成</h2>
        <div class="form-group">
          <label>業務名 *</label>
          <input
            v-model="newInstance.name"
            type="text"
            placeholder="例: 入学式準備"
            @keyup.enter="createInstance"
          />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>年度</label>
            <input
              v-model.number="newInstance.fiscal_year"
              type="number"
              min="2020"
              max="2100"
            />
          </div>
          <div class="form-group">
            <label>開始日</label>
            <input
              v-model="newInstance.actual_start"
              type="date"
            />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreateModal = false">キャンセル</button>
          <button class="btn btn-primary" @click="createInstance">作成</button>
        </div>
      </div>
    </div>

    <!-- 業務編集モーダル -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h2>業務を編集</h2>
        <div class="form-group">
          <label>業務名</label>
          <input
            v-model="editInstance.name"
            type="text"
            placeholder="例: 入学式準備"
          />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>年度</label>
            <input
              v-model.number="editInstance.fiscal_year"
              type="number"
              min="2020"
              max="2100"
            />
          </div>
          <div class="form-group">
            <label>開始日</label>
            <input
              v-model="editInstance.actual_start"
              type="date"
            />
          </div>
        </div>
        <div class="form-group">
          <label>ステータス</label>
          <select v-model="editInstance.status">
            <option value="not_started">未着手</option>
            <option value="in_progress">進行中</option>
            <option value="completed">完了</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-danger" @click="deleteInstance">削除</button>
          <div style="flex: 1;"></div>
          <button class="btn btn-secondary" @click="showEditModal = false">キャンセル</button>
          <button class="btn btn-primary" @click="updateInstance">保存</button>
        </div>
      </div>
    </div>

    <!-- タスク追加モーダル -->
    <div v-if="showAddTaskModal" class="modal-overlay" @click.self="showAddTaskModal = false; parentTaskForChild = null">
      <div class="modal">
        <h2>{{ parentTaskForChild ? '子タスクを追加' : 'タスクを追加' }}</h2>
        <div v-if="parentTaskForChild" class="parent-task-info">
          親タスク: <strong>{{ parentTaskForChild.title }}</strong>
        </div>
        <div class="form-group">
          <label>タスク名 *</label>
          <input
            v-model="newTask.title"
            type="text"
            placeholder="例: 書類準備"
            @keyup.enter="addTask"
          />
        </div>
        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="newTask.description"
            rows="2"
            placeholder="タスクの詳細説明"
          ></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>期限</label>
            <input v-model="newTask.due_date" type="date" />
          </div>
          <div class="form-group">
            <label>優先度</label>
            <select v-model="newTask.priority">
              <option value="urgent">緊急</option>
              <option value="important">重要</option>
              <option value="normal">通常</option>
              <option value="none">なし</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>担当者</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input
                type="checkbox"
                :value="member.id"
                v-model="newTask.assignee_ids"
              />
              {{ member.name }}
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAddTaskModal = false">キャンセル</button>
          <button class="btn btn-primary" @click="addTask">追加</button>
        </div>
      </div>
    </div>

    <!-- テンプレート保存モーダル -->
    <div v-if="showSaveTemplateModal" class="modal-overlay" @click.self="showSaveTemplateModal = false">
      <div class="modal">
        <h2>テンプレートとして保存</h2>
        <p class="modal-desc">現在の業務をテンプレートとして保存すると、来年度以降も同じタスク構成で業務を開始できます。</p>
        <div class="form-group">
          <label>テンプレート名 *</label>
          <input
            v-model="templateForm.name"
            type="text"
            placeholder="例: 入学式準備"
          />
        </div>
        <div class="form-group">
          <label>プレフィックス（URLで使用）</label>
          <input
            v-model="templateForm.prefix"
            type="text"
            placeholder="例: NYUGAKU"
            class="prefix-input"
          />
          <p class="help-text">大文字英字のみ。URLで /グループ/NYUGAKU-1 のように使われます</p>
        </div>
        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="templateForm.description"
            rows="2"
            placeholder="業務の概要"
          ></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showSaveTemplateModal = false">キャンセル</button>
          <button class="btn btn-primary" @click="saveAsTemplate">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-workspace {
  display: flex;
  gap: 1px;
  background: #e0e0e0;
  overflow: hidden;
  position: fixed;
  top: 56px;
  left: 220px;
  right: 0;
  bottom: 0;
}

/* === スライドアニメーション === */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* === モーダル === */
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
  color: #1a1a2e;
}

.modal-desc {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 1rem 0;
}

.parent-task-info {
  font-size: 0.875rem;
  color: #666;
  background: #f3f4f6;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #333;
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

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #4cc9f0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  max-height: 120px;
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
}

.checkbox-item input {
  width: auto;
  margin: 0;
}

.help-text {
  font-size: 0.75rem;
  color: #999;
  margin: 0.25rem 0 0 0;
}

.prefix-input {
  text-transform: uppercase;
  font-family: monospace;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
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
  background: #fecaca;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fca5a5;
}
</style>
