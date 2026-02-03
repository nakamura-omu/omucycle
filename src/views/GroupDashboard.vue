<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasksStore } from '@/stores/tasks'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()

const groupId = computed(() => route.params.groupId as string)

interface HistoryEntry {
  id: string
  task_id: string
  user_name: string
  task_title: string
  task_number: number | null
  action_type: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

const history = ref<HistoryEntry[]>([])
const isLoadingHistory = ref(false)

const urgentTasks = computed(() =>
  tasksStore.tasks
    .filter(t => t.status !== 'completed' && t.priority === 'urgent')
    .slice(0, 5)
)

const upcomingTasks = computed(() =>
  tasksStore.tasks
    .filter(t => t.status !== 'completed' && t.due_date)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, 5)
)

async function fetchHistory() {
  isLoadingHistory.value = true
  try {
    const res = await fetch(`/api/groups/${groupId.value}/history?limit=10`)
    if (res.ok) {
      history.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch history:', error)
  } finally {
    isLoadingHistory.value = false
  }
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    status: 'ステータス',
    priority: '優先度',
    title: 'タイトル',
    description: '説明',
    assignee_id: '担当者',
    assignee_ids: '担当者',
    start_date: '開始日',
    due_date: '期限日',
  }
  return labels[field] || field
}

function formatHistoryTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP')
}

onMounted(() => {
  tasksStore.fetchGroupTasks(groupId.value)
  fetchHistory()
})

function goToTask(taskId: string) {
  router.push(`/groups/${groupId.value}/tasks/${taskId}`)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  })
}

const priorityColors: Record<string, string> = {
  urgent: '#ef4444',
  important: '#f59e0b',
  normal: '#6b7280',
  none: '#d1d5db',
}
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-grid">
      <!-- 緊急タスク -->
      <div class="dashboard-card">
        <h3>🔴 緊急タスク</h3>
        <div v-if="urgentTasks.length === 0" class="empty-state">
          緊急タスクはありません
        </div>
        <div v-else class="task-list">
          <div
            v-for="task in urgentTasks"
            :key="task.id"
            class="task-item"
            @click="goToTask(task.id)"
          >
            <span class="task-title">{{ task.title }}</span>
            <span class="task-due">{{ formatDate(task.due_date) }}</span>
          </div>
        </div>
      </div>

      <!-- 期限が近いタスク -->
      <div class="dashboard-card">
        <h3>📅 期限が近いタスク</h3>
        <div v-if="upcomingTasks.length === 0" class="empty-state">
          期限が設定されたタスクはありません
        </div>
        <div v-else class="task-list">
          <div
            v-for="task in upcomingTasks"
            :key="task.id"
            class="task-item"
            @click="goToTask(task.id)"
          >
            <span
              class="priority-dot"
              :style="{ background: priorityColors[task.priority] }"
            ></span>
            <span class="task-title">{{ task.title }}</span>
            <span class="task-due">{{ formatDate(task.due_date) }}</span>
          </div>
        </div>
      </div>

      <!-- 統計 -->
      <div class="dashboard-card stats-card">
        <h3>📊 統計</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ tasksStore.tasksByStatus.not_started.length }}</span>
            <span class="stat-label">未着手</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ tasksStore.tasksByStatus.in_progress.length }}</span>
            <span class="stat-label">進行中</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ tasksStore.tasksByStatus.completed.length }}</span>
            <span class="stat-label">完了</span>
          </div>
        </div>
      </div>

      <!-- 最近の履歴 -->
      <div class="dashboard-card history-card">
        <h3>📝 最近の履歴</h3>
        <div v-if="isLoadingHistory" class="empty-state">読み込み中...</div>
        <div v-else-if="history.length === 0" class="empty-state">
          履歴はありません
        </div>
        <div v-else class="history-list">
          <div
            v-for="entry in history"
            :key="entry.id"
            class="history-item"
          >
            <div class="history-main">
              <span class="history-user">{{ entry.user_name }}</span>
              が
              <span class="history-task" @click="goToTask(entry.task_id)">
                #{{ entry.task_number || '-' }} {{ entry.task_title }}
              </span>
              の
              <span class="history-field">{{ getFieldLabel(entry.field_name || '') }}</span>
              を変更
            </div>
            <div class="history-time">{{ formatHistoryTime(entry.created_at) }}</div>
          </div>
        </div>
      </div>

      <!-- ファイル -->
      <div class="dashboard-card files-card">
        <h3>📁 ファイル</h3>
        <div class="coming-soon">
          <span class="coming-soon-icon">🚧</span>
          <span>Coming Soon</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.dashboard-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dashboard-card h3 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0 0 1rem 0;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem;
  background: #f8f9fa;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.task-item:hover {
  background: #e9ecef;
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-title {
  flex: 1;
  font-size: 0.875rem;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-due {
  font-size: 0.75rem;
  color: #666;
  flex-shrink: 0;
}

.empty-state {
  color: #999;
  font-size: 0.875rem;
  text-align: center;
  padding: 1rem;
}

.stats-card .stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

/* 履歴 */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-item {
  padding: 0.5rem 0.625rem;
  background: #fefce8;
  border-radius: 6px;
  border-left: 3px solid #facc15;
}

.history-main {
  font-size: 0.8125rem;
  color: #666;
  line-height: 1.5;
}

.history-user {
  font-weight: 600;
  color: #1a1a2e;
}

.history-task {
  color: #4338ca;
  cursor: pointer;
}

.history-task:hover {
  text-decoration: underline;
}

.history-field {
  color: #059669;
}

.history-time {
  font-size: 0.7rem;
  color: #999;
  margin-top: 0.25rem;
}

/* Coming Soon */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #999;
  gap: 0.5rem;
}

.coming-soon-icon {
  font-size: 2rem;
}
</style>
