<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()
const userStore = useUserStore()

const taskId = computed(() => route.params.taskId as string)
const groupId = computed(() => route.params.groupId as string)

const newComment = ref('')
const isEditing = ref(false)
const editForm = ref({
  title: '',
  description: '',
  due_date: '',
  priority: 'normal' as Task['priority'],
  status: 'not_started' as Task['status'],
})

async function loadTask() {
  if (taskId.value) {
    await tasksStore.fetchTask(taskId.value)
    await tasksStore.fetchComments(taskId.value)
    if (tasksStore.currentTask) {
      editForm.value = {
        title: tasksStore.currentTask.title,
        description: tasksStore.currentTask.description || '',
        due_date: tasksStore.currentTask.due_date || '',
        priority: tasksStore.currentTask.priority,
        status: tasksStore.currentTask.status,
      }
    }
  }
}

onMounted(() => {
  loadTask()
})

watch(taskId, () => {
  loadTask()
})

function goBack() {
  router.push(`/groups/${groupId.value}/tasks`)
}

async function submitComment() {
  if (!newComment.value.trim() || !userStore.currentUser) return

  await tasksStore.addComment(
    taskId.value,
    userStore.currentUser.id,
    newComment.value.trim()
  )
  newComment.value = ''
}

async function saveChanges() {
  await tasksStore.updateTask(taskId.value, editForm.value)
  isEditing.value = false
}

async function updateStatus(status: Task['status']) {
  await tasksStore.updateStatus(taskId.value, status)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const priorityLabels: Record<string, string> = {
  urgent: '🔴 緊急',
  important: '🟡 重要',
  normal: '普通',
  none: 'なし',
}

const statusOptions: { value: Task['status']; label: string }[] = [
  { value: 'not_started', label: '未着手' },
  { value: 'in_progress', label: '進行中' },
  { value: 'completed', label: '完了' },
]
</script>

<template>
  <div class="task-detail-page">
    <div class="page-header">
      <button class="back-btn" @click="goBack">← タスク一覧</button>
      <div class="header-actions">
        <button
          v-if="!isEditing"
          class="btn btn-secondary"
          @click="isEditing = true"
        >
          編集
        </button>
        <template v-else>
          <button class="btn btn-secondary" @click="isEditing = false">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="saveChanges">
            保存
          </button>
        </template>
      </div>
    </div>

    <div v-if="tasksStore.currentTask" class="task-content">
      <div class="main-section">
        <!-- タイトル -->
        <div v-if="isEditing" class="form-group">
          <label>タスク名</label>
          <input v-model="editForm.title" type="text" class="title-input" />
        </div>
        <h1 v-else class="task-title">{{ tasksStore.currentTask.title }}</h1>

        <!-- メタ情報 -->
        <div class="task-meta">
          <div class="meta-item">
            <span class="meta-label">ステータス</span>
            <div v-if="isEditing">
              <select v-model="editForm.status">
                <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div v-else class="status-buttons">
              <button
                v-for="opt in statusOptions"
                :key="opt.value"
                class="status-btn"
                :class="{ active: tasksStore.currentTask.status === opt.value }"
                @click="updateStatus(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="meta-item">
            <span class="meta-label">優先度</span>
            <select v-if="isEditing" v-model="editForm.priority">
              <option value="urgent">緊急</option>
              <option value="important">重要</option>
              <option value="normal">普通</option>
              <option value="none">なし</option>
            </select>
            <span v-else>{{ priorityLabels[tasksStore.currentTask.priority] }}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">期限</span>
            <input v-if="isEditing" v-model="editForm.due_date" type="date" />
            <span v-else>{{ formatDate(tasksStore.currentTask.due_date) || '未設定' }}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">担当者</span>
            <span>{{ tasksStore.currentTask.assignee_name || '未割当' }}</span>
          </div>
        </div>

        <!-- 説明 -->
        <div class="description-section">
          <h3>説明</h3>
          <textarea
            v-if="isEditing"
            v-model="editForm.description"
            rows="4"
            placeholder="タスクの説明を入力"
          ></textarea>
          <p v-else-if="tasksStore.currentTask.description" class="description">
            {{ tasksStore.currentTask.description }}
          </p>
          <p v-else class="no-description">説明なし</p>
        </div>

        <!-- 子タスク -->
        <div v-if="tasksStore.currentTask.children?.length" class="children-section">
          <h3>子タスク</h3>
          <div class="children-list">
            <div
              v-for="child in tasksStore.currentTask.children"
              :key="child.id"
              class="child-task"
              @click="router.push(`/groups/${groupId}/tasks/${child.id}`)"
            >
              <span class="child-status">{{ child.status === 'completed' ? '☑' : '☐' }}</span>
              <span class="child-title">{{ child.title }}</span>
              <span class="child-due">{{ formatDate(child.due_date) }}</span>
            </div>
          </div>
        </div>

        <!-- コメント -->
        <div class="comments-section">
          <h3>コメント</h3>
          <div class="comments-list">
            <div
              v-for="comment in tasksStore.comments"
              :key="comment.id"
              class="comment"
              :class="{ 'ai-comment': comment.is_ai_generated }"
            >
              <div class="comment-header">
                <span class="comment-author">
                  {{ comment.is_ai_generated ? '🤖 AI' : comment.user_name }}
                </span>
                <span class="comment-time">{{ formatDateTime(comment.created_at) }}</span>
              </div>
              <p class="comment-content">{{ comment.content }}</p>
            </div>

            <div v-if="tasksStore.comments.length === 0" class="no-comments">
              コメントはありません
            </div>
          </div>

          <div class="comment-input">
            <textarea
              v-model="newComment"
              placeholder="コメントを入力..."
              rows="2"
              @keydown.meta.enter="submitComment"
              @keydown.ctrl.enter="submitComment"
            ></textarea>
            <button class="btn btn-primary" @click="submitComment">
              送信
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="loading">読み込み中...</div>
  </div>
</template>

<style scoped>
.task-detail-page {
  max-width: 800px;
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

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.task-content {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.task-title {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0 0 1rem 0;
}

.title-input {
  font-size: 1.25rem;
  font-weight: 600;
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.task-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meta-label {
  font-size: 0.75rem;
  color: #666;
  text-transform: uppercase;
}

.meta-item select,
.meta-item input {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.status-buttons {
  display: flex;
  gap: 0.25rem;
}

.status-btn {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}

.status-btn.active {
  background: #4cc9f0;
  border-color: #4cc9f0;
  color: #1a1a2e;
}

.description-section,
.children-section,
.comments-section {
  margin-bottom: 1.5rem;
}

.description-section h3,
.children-section h3,
.comments-section h3 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0 0 0.75rem 0;
}

.description {
  color: #333;
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
}

.no-description {
  color: #999;
  font-style: italic;
  margin: 0;
}

.description-section textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  resize: vertical;
}

.children-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.child-task {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  cursor: pointer;
}

.child-task:hover {
  background: #e9ecef;
}

.child-status {
  font-size: 1rem;
}

.child-title {
  flex: 1;
  font-size: 0.875rem;
}

.child-due {
  font-size: 0.75rem;
  color: #666;
}

.comments-list {
  margin-bottom: 1rem;
}

.comment {
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
}

.comment:last-child {
  border-bottom: none;
}

.comment.ai-comment {
  background: #f0f9ff;
  border-radius: 6px;
  border-bottom: none;
  margin-bottom: 0.5rem;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.comment-author {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1a1a2e;
}

.comment-time {
  font-size: 0.75rem;
  color: #999;
}

.comment-content {
  font-size: 0.875rem;
  color: #333;
  margin: 0;
  line-height: 1.5;
}

.no-comments {
  color: #999;
  text-align: center;
  padding: 1rem;
}

.comment-input {
  display: flex;
  gap: 0.5rem;
}

.comment-input textarea {
  flex: 1;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  resize: none;
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
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
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
</style>
