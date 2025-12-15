<script setup lang="ts">
import { computed } from 'vue'

export interface JobInstance {
  id: string
  job_definition_id: string | null
  job_name: string | null
  job_prefix: string | null
  instance_number: number | null
  category: string | null
  fiscal_year: number
  actual_start: string | null
  actual_end: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  task_count: number
  completed_count: number
  created_at: string
}

const props = defineProps<{
  instances: JobInstance[]
  selectedId: string | null
  isLoading: boolean
  jobDefinitionsLink: string
}>()

const emit = defineEmits<{
  select: [instance: JobInstance]
  create: []
}>()

function getProgress(instance: JobInstance): number {
  if (instance.task_count === 0) return 0
  return Math.round((instance.completed_count / instance.task_count) * 100)
}

function getInstanceKey(instance: JobInstance): string | null {
  if (instance.job_prefix && instance.instance_number) {
    return `${instance.job_prefix}-${instance.instance_number}`
  }
  return null
}
</script>

<template>
  <div class="instances-pane">
    <div class="pane-header">
      <h3>業務タスク</h3>
      <button class="create-btn" @click="emit('create')" title="新しい業務を作成">
        +
      </button>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <div v-else-if="instances.length === 0" class="empty-pane">
      <p>業務タスクがありません</p>
      <button class="btn btn-primary" @click="emit('create')">
        新しい業務を作成
      </button>
      <p class="or-text">または</p>
      <router-link :to="jobDefinitionsLink" class="link">
        テンプレートから作成 →
      </router-link>
    </div>

    <div v-else class="instance-list">
      <div
        v-for="instance in instances"
        :key="instance.id"
        class="instance-item"
        :class="{ selected: selectedId === instance.id }"
        @click="emit('select', instance)"
      >
        <div class="instance-key">{{ getInstanceKey(instance) || instance.id.slice(0, 8) }}</div>
        <div class="instance-name">{{ instance.job_name || '（名称なし）' }}</div>
        <div class="instance-info">
          <span class="fiscal-year">{{ instance.fiscal_year }}年度</span>
          <span class="progress">{{ getProgress(instance) }}%</span>
        </div>
        <div class="progress-bar-mini">
          <div class="progress-fill" :style="{ width: getProgress(instance) + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.instances-pane {
  width: 280px;
  flex-shrink: 0;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pane-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.create-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: #4cc9f0;
  color: #1a1a2e;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.create-btn:hover {
  background: #3ab8df;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-pane {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-pane .btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  margin: 0.75rem 0;
}

.empty-pane .btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.or-text {
  font-size: 0.75rem;
  color: #999;
  margin: 0.5rem 0;
}

.link {
  color: #4cc9f0;
  text-decoration: none;
  font-size: 0.875rem;
}

.link:hover {
  text-decoration: underline;
}

.instance-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.instance-item {
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 0.25rem;
  transition: background 0.15s;
}

.instance-item:hover {
  background: #f5f5f5;
}

.instance-item.selected {
  background: #e0e7ff;
}

.instance-key {
  font-size: 0.7rem;
  font-family: monospace;
  color: #666;
  margin-bottom: 0.25rem;
}

.instance-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #999;
  margin-bottom: 0.375rem;
}

.progress-bar-mini {
  height: 3px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-mini .progress-fill {
  height: 100%;
  background: #22c55e;
  border-radius: 2px;
}
</style>
