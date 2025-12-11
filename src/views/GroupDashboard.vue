<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasksStore } from '@/stores/tasks'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()

const groupId = computed(() => route.params.groupId as string)

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

onMounted(() => {
  tasksStore.fetchGroupTasks(groupId.value)
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
</style>
