<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()
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

// 拡張されたTask型（インスタンス情報含む）
interface TaskWithInstanceInfo extends Task {
  job_prefix?: string | null
  instance_number?: number | null
  task_number?: number | null
}

// 現在表示中の年月
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth()) // 0-indexed

// 曜日ラベル
const weekDays = ['日', '月', '火', '水', '木', '金', '土']

// 現在の月の表示名
const currentMonthName = computed(() => {
  return `${currentYear.value}年${currentMonth.value + 1}月`
})

// カレンダーの日付配列を生成
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value

  // 月の最初と最後の日
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // 月初の曜日（0=日曜）
  const startDayOfWeek = firstDay.getDay()

  // カレンダー配列
  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = []

  // 前月の日を埋める
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i)
    days.push({ date, isCurrentMonth: false, isToday: false })
  }

  // 今日の日付
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 当月の日を追加
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d)
    const isToday = date.getTime() === today.getTime()
    days.push({ date, isCurrentMonth: true, isToday })
  }

  // 次月の日を埋める（6週分になるように）
  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i)
    days.push({ date, isCurrentMonth: false, isToday: false })
  }

  return days
})

// 日付をキーにしたタスクマップ
const tasksByDate = computed(() => {
  const map: Record<string, Task[]> = {}

  for (const task of tasksStore.tasks) {
    if (task.due_date) {
      const dateKey = task.due_date.split('T')[0] as string
      if (!map[dateKey]) {
        map[dateKey] = []
      }
      map[dateKey].push(task)
    }
  }

  return map
})

// 日付のキーを取得
function getDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// その日のタスクを取得
function getTasksForDate(date: Date): Task[] {
  const key = getDateKey(date)
  return tasksByDate.value[key] || []
}

// 前月へ
function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

// 次月へ
function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

// 今月へ
function goToToday() {
  const today = new Date()
  currentYear.value = today.getFullYear()
  currentMonth.value = today.getMonth()
}

// タスク詳細へ遷移
function goToTask(task: TaskWithInstanceInfo) {
  // インスタンスに紐づくタスクで、slug/prefix/instance_number/task_numberがあれば新URL形式
  if (resolvedGroupSlug.value && task.job_prefix && task.instance_number && task.task_number) {
    const instanceKey = `${task.job_prefix}-${task.instance_number}`
    router.push(`/${resolvedGroupSlug.value}/${instanceKey}/tasks/${task.task_number}`)
  } else if (resolvedGroupSlug.value) {
    // slugあるけどインスタンス情報がない場合
    router.push(`/${resolvedGroupSlug.value}/tasks/${task.id}`)
  } else {
    // 旧形式
    router.push(`/groups/${resolvedGroupId.value}/tasks/${task.id}`)
  }
}

// 優先度の色を取得
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#ef4444'
    case 'important': return '#f59e0b'
    default: return '#6b7280'
  }
}

// ステータスのスタイル
function getStatusClass(status: string): string {
  return status === 'completed' ? 'completed' : ''
}

onMounted(async () => {
  await tasksStore.fetchGroupTasks(resolvedGroupId.value)
})

watch(resolvedGroupId, async () => {
  await tasksStore.fetchGroupTasks(resolvedGroupId.value)
})
</script>

<template>
  <div class="calendar-page">
    <div class="calendar-header">
      <h2>業務カレンダー</h2>
      <div class="calendar-nav">
        <button class="nav-btn" @click="prevMonth">&lt;</button>
        <span class="current-month">{{ currentMonthName }}</span>
        <button class="nav-btn" @click="nextMonth">&gt;</button>
        <button class="today-btn" @click="goToToday">今日</button>
      </div>
    </div>

    <div class="calendar-grid">
      <!-- 曜日ヘッダー -->
      <div class="weekday-header">
        <div
          v-for="(day, index) in weekDays"
          :key="day"
          class="weekday-cell"
          :class="{ sunday: index === 0, saturday: index === 6 }"
        >
          {{ day }}
        </div>
      </div>

      <!-- 日付グリッド -->
      <div class="days-grid">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="day-cell"
          :class="{
            'other-month': !day.isCurrentMonth,
            'today': day.isToday,
            'sunday': index % 7 === 0,
            'saturday': index % 7 === 6,
          }"
        >
          <div class="day-number">{{ day.date.getDate() }}</div>
          <div class="day-tasks">
            <div
              v-for="task in getTasksForDate(day.date).slice(0, 3)"
              :key="task.id"
              class="task-item"
              :class="getStatusClass(task.status)"
              :style="{ borderLeftColor: getPriorityColor(task.priority) }"
              @click="goToTask(task as TaskWithInstanceInfo)"
            >
              {{ task.title }}
            </div>
            <div
              v-if="getTasksForDate(day.date).length > 3"
              class="more-tasks"
            >
              +{{ getTasksForDate(day.date).length - 3 }}件
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 凡例 -->
    <div class="legend">
      <div class="legend-item">
        <span class="legend-color" style="background: #ef4444"></span>
        緊急
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #f59e0b"></span>
        重要
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #6b7280"></span>
        通常
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-page {
  max-width: 1200px;
  margin: 0 auto;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.calendar-header h2 {
  font-size: 1.25rem;
  color: #1a1a2e;
  margin: 0;
}

.calendar-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
}

.nav-btn:hover {
  background: #f5f5f5;
}

.current-month {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  min-width: 120px;
  text-align: center;
}

.today-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
  margin-left: 0.5rem;
}

.today-btn:hover {
  background: #f5f5f5;
}

.calendar-grid {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.weekday-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
}

.weekday-cell {
  padding: 0.75rem;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  color: #666;
}

.weekday-cell.sunday {
  color: #ef4444;
}

.weekday-cell.saturday {
  color: #3b82f6;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.day-cell {
  min-height: 100px;
  border-right: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  padding: 0.5rem;
  background: white;
}

.day-cell:nth-child(7n) {
  border-right: none;
}

.day-cell.other-month {
  background: #fafafa;
}

.day-cell.other-month .day-number {
  color: #ccc;
}

.day-cell.today {
  background: #eff6ff;
}

.day-cell.today .day-number {
  background: #4cc9f0;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-cell.sunday .day-number {
  color: #ef4444;
}

.day-cell.saturday .day-number {
  color: #3b82f6;
}

.day-number {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.day-tasks {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  font-size: 0.7rem;
  padding: 2px 4px;
  background: #f0f0f0;
  border-radius: 2px;
  border-left: 3px solid;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #333;
}

.task-item:hover {
  background: #e0e0e0;
}

.task-item.completed {
  text-decoration: line-through;
  opacity: 0.6;
}

.more-tasks {
  font-size: 0.65rem;
  color: #666;
  padding: 2px 4px;
}

.legend {
  display: flex;
  gap: 1.5rem;
  margin-top: 1rem;
  padding: 0.75rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #666;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
</style>
