<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()
const groupsStore = useGroupsStore()
const userStore = useUserStore()

const groupId = computed(() => route.params.groupId as string)
const viewMode = ref<'list' | 'kanban'>('list')
const showCreateModal = ref(false)
const newTask = ref({
  title: '',
  description: '',
  due_date: '',
  priority: 'normal' as Task['priority'],
  assignee_id: '' as string,
  parent_task_id: '' as string,
})

onMounted(async () => {
  await Promise.all([
    tasksStore.fetchGroupTasks(groupId.value),
    groupsStore.fetchMembers(groupId.value),
  ])
})

watch(() => showCreateModal.value, (val) => {
  if (val) {
    // モーダルを開いたらデフォルトで自分をアサイン
    newTask.value.assignee_id = userStore.currentUser?.id || ''
  }
})

function goToTask(taskId: string) {
  router.push(`/groups/${groupId.value}/tasks/${taskId}`)
}

async function createTask() {
  if (!newTask.value.title.trim() || !userStore.currentUser) return

  try {
    await tasksStore.createTask({
      group_id: groupId.value,
      title: newTask.value.title.trim(),
      description: newTask.value.description || null,
      due_date: newTask.value.due_date || null,
      priority: newTask.value.priority,
      assignee_id: newTask.value.assignee_id || null,
      parent_task_id: newTask.value.parent_task_id || null,
      created_by: userStore.currentUser.id,
    })
    showCreateModal.value = false
    newTask.value = { title: '', description: '', due_date: '', priority: 'normal', assignee_id: '', parent_task_id: '' }
    // タスク一覧を再取得
    await tasksStore.fetchGroupTasks(groupId.value)
  } catch (error) {
    console.error('Failed to create task:', error)
  }
}

async function toggleStatus(task: Task, e: Event) {
  e.stopPropagation()
  const newStatus = task.status === 'completed' ? 'not_started' : 'completed'
  await tasksStore.updateStatus(task.id, newStatus)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  })
}

const priorityLabels: Record<string, string> = {
  urgent: '🔴 緊急',
  important: '🟡 重要',
  normal: '普通',
  none: 'なし',
}

const statusLabels: Record<string, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
}
</script>

<template>
  <div class="task-list-page">
    <div class="page-header">
      <h2>タスク一覧</h2>
      <div class="header-actions">
        <div class="view-toggle">
          <button
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            リスト
          </button>
          <button
            :class="{ active: viewMode === 'kanban' }"
            @click="viewMode = 'kanban'"
          >
            カンバン
          </button>
        </div>
        <button class="btn btn-primary" @click="showCreateModal = true">
          + タスク追加
        </button>
      </div>
    </div>

    <!-- リスト表示 -->
    <div v-if="viewMode === 'list'" class="list-view">
      <div
        v-for="task in tasksStore.parentTasks"
        :key="task.id"
        class="task-row"
        :class="{ completed: task.status === 'completed' }"
        @click="goToTask(task.id)"
      >
        <button class="checkbox" @click="toggleStatus(task, $event)">
          {{ task.status === 'completed' ? '☑' : '☐' }}
        </button>
        <div class="task-content">
          <span class="task-title">{{ task.title }}</span>
          <div class="task-meta">
            <span v-if="task.due_date" class="due-date">{{ formatDate(task.due_date) }}</span>
            <span v-if="task.assignee_name" class="assignee">@{{ task.assignee_name }}</span>
            <span class="priority" :data-priority="task.priority">
              {{ priorityLabels[task.priority] }}
            </span>
          </div>
        </div>
        <span class="status-badge" :data-status="task.status">
          {{ statusLabels[task.status] }}
        </span>
      </div>

      <div v-if="tasksStore.parentTasks.length === 0" class="empty-state">
        タスクがありません
      </div>
    </div>

    <!-- カンバン表示 -->
    <div v-else class="kanban-view">
      <div
        v-for="(label, status) in statusLabels"
        :key="status"
        class="kanban-column"
      >
        <h3 class="column-header">{{ label }}</h3>
        <div class="column-tasks">
          <div
            v-for="task in tasksStore.tasksByStatus[status as keyof typeof tasksStore.tasksByStatus]"
            :key="task.id"
            class="kanban-card"
            @click="goToTask(task.id)"
          >
            <div class="card-title">{{ task.title }}</div>
            <div class="card-meta">
              <span v-if="task.due_date">{{ formatDate(task.due_date) }}</span>
              <span v-if="task.assignee_name">@{{ task.assignee_name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- タスク作成モーダル -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h2>新しいタスク</h2>
        <div class="form-group">
          <label>タスク名 *</label>
          <input
            v-model="newTask.title"
            type="text"
            placeholder="タスク名を入力"
          />
        </div>
        <div class="form-group">
          <label>説明</label>
          <textarea
            v-model="newTask.description"
            placeholder="タスクの説明（任意）"
            rows="3"
          ></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>担当者</label>
            <select v-model="newTask.assignee_id">
              <option value="">未割当</option>
              <option
                v-for="member in groupsStore.members"
                :key="member.id"
                :value="member.id"
              >
                {{ member.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>親タスク</label>
            <select v-model="newTask.parent_task_id">
              <option value="">なし（親タスクとして作成）</option>
              <option
                v-for="task in tasksStore.parentTasks"
                :key="task.id"
                :value="task.id"
              >
                {{ task.title }}
              </option>
            </select>
          </div>
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
              <option value="normal">普通</option>
              <option value="none">なし</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreateModal = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="createTask">
            作成
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-list-page {
  max-width: 1200px;
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

.header-actions {
  display: flex;
  gap: 1rem;
}

.view-toggle {
  display: flex;
  background: #e0e0e0;
  border-radius: 6px;
  padding: 2px;
}

.view-toggle button {
  padding: 0.375rem 0.75rem;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
}

.view-toggle button.active {
  background: white;
  color: #1a1a2e;
}

/* リスト表示 */
.list-view {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.task-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background 0.15s;
}

.task-row:hover {
  background: #f8f9fa;
}

.task-row:last-child {
  border-bottom: none;
}

.task-row.completed {
  opacity: 0.6;
}

.task-row.completed .task-title {
  text-decoration: line-through;
}

.checkbox {
  border: none;
  background: none;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-size: 0.9375rem;
  color: #1a1a2e;
  display: block;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #666;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #e0e0e0;
}

.status-badge[data-status="in_progress"] {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge[data-status="completed"] {
  background: #dcfce7;
  color: #166534;
}

/* カンバン表示 */
.kanban-view {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.kanban-column {
  background: #e9ecef;
  border-radius: 8px;
  padding: 0.75rem;
  min-height: 400px;
}

.column-header {
  font-size: 0.875rem;
  font-weight: 600;
  color: #495057;
  margin: 0 0 0.75rem 0;
  padding: 0.25rem 0.5rem;
}

.column-tasks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.kanban-card {
  background: white;
  border-radius: 6px;
  padding: 0.75rem;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s, box-shadow 0.15s;
}

.kanban-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card-title {
  font-size: 0.875rem;
  color: #1a1a2e;
  margin-bottom: 0.5rem;
}

.card-meta {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  gap: 0.5rem;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 2rem;
}

/* ボタン・モーダル（共通スタイル） */
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
