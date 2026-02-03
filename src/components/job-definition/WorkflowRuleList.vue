<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

export interface WorkflowRule {
  id: string
  job_definition_id: string
  name: string
  trigger_type: string
  trigger_config: {
    from_status?: string
    to_status?: string
  } | null
  action_type: string
  action_config: {
    assignee_id?: string
    assignee_ids?: string[]
    status?: string
  } | null
  is_active: number
  sort_order: number
}

interface GroupStatus {
  id: string
  key: string
  label: string
  color: string
}

interface Member {
  id: string
  name: string
}

const props = defineProps<{
  jobId: string
  statuses: GroupStatus[]
  members: Member[]
}>()

const emit = defineEmits<{
  'add': []
  'edit': [rule: WorkflowRule]
}>()

const rules = ref<WorkflowRule[]>([])
const isLoading = ref(false)

async function fetchRules() {
  if (!props.jobId) return
  isLoading.value = true
  try {
    const res = await fetch(`/api/job-definitions/${props.jobId}/rules`)
    if (res.ok) {
      rules.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch rules:', error)
  } finally {
    isLoading.value = false
  }
}

async function toggleActive(rule: WorkflowRule) {
  try {
    const res = await fetch(`/api/workflow-rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
    })
    if (res.ok) {
      rule.is_active = rule.is_active ? 0 : 1
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error)
  }
}

async function deleteRule(rule: WorkflowRule) {
  if (!confirm(`ルール「${rule.name}」を削除しますか？`)) return
  try {
    const res = await fetch(`/api/workflow-rules/${rule.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await fetchRules()
    }
  } catch (error) {
    console.error('Failed to delete rule:', error)
  }
}

function getStatusLabel(key: string): string {
  const status = props.statuses.find(s => s.key === key)
  return status?.label || key
}

function getMemberName(id: string): string {
  const member = props.members.find(m => m.id === id)
  return member?.name || '(不明)'
}

function getTriggerDescription(rule: WorkflowRule): string {
  if (rule.trigger_type === 'status_changed') {
    const from = rule.trigger_config?.from_status
    const to = rule.trigger_config?.to_status
    if (from && to) {
      return `${getStatusLabel(from)} → ${getStatusLabel(to)}`
    } else if (to) {
      return `→ ${getStatusLabel(to)}`
    } else if (from) {
      return `${getStatusLabel(from)} →`
    }
    return 'ステータス変更時'
  }
  return rule.trigger_type
}

function getActionDescription(rule: WorkflowRule): string {
  if (rule.action_type === 'change_assignee') {
    const ids = rule.action_config?.assignee_ids
    const id = rule.action_config?.assignee_id
    if (ids && ids.length > 0) {
      const names = ids.map(getMemberName).join(', ')
      return `担当者を ${names} に変更`
    } else if (id) {
      return `担当者を ${getMemberName(id)} に変更`
    }
    return '担当者を変更'
  } else if (rule.action_type === 'change_status') {
    const status = rule.action_config?.status
    if (status) {
      return `ステータスを ${getStatusLabel(status)} に変更`
    }
    return 'ステータスを変更'
  }
  return rule.action_type
}

// 公開メソッド
defineExpose({ fetchRules })

watch(() => props.jobId, () => {
  fetchRules()
})

onMounted(() => {
  fetchRules()
})
</script>

<template>
  <div class="rules-section">
    <div class="section-header">
      <h2>ワークフロールール</h2>
      <button class="btn btn-primary btn-sm" @click="$emit('add')">
        + ルール追加
      </button>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <div v-else-if="rules.length === 0" class="empty-rules">
      <p>ルールがありません</p>
      <p class="hint">ルールを追加して、タスクのステータス変更時に自動でアクションを実行できます</p>
    </div>

    <div v-else class="rule-list">
      <div
        v-for="rule in rules"
        :key="rule.id"
        class="rule-item"
        :class="{ inactive: !rule.is_active }"
      >
        <div class="rule-toggle">
          <button
            class="toggle-btn"
            :class="{ active: rule.is_active }"
            @click="toggleActive(rule)"
            :title="rule.is_active ? '無効化' : '有効化'"
          >
            {{ rule.is_active ? 'ON' : 'OFF' }}
          </button>
        </div>
        <div class="rule-content">
          <div class="rule-name">{{ rule.name }}</div>
          <div class="rule-description">
            <span class="trigger">{{ getTriggerDescription(rule) }}</span>
            <span class="arrow">→</span>
            <span class="action">{{ getActionDescription(rule) }}</span>
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn btn-sm btn-secondary" @click="$emit('edit', rule)">
            編集
          </button>
          <button class="btn btn-sm btn-danger" @click="deleteRule(rule)">
            削除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
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

.loading {
  text-align: center;
  color: #666;
  padding: 1rem;
}

.empty-rules {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty-rules .hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.5rem;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  background: #f8f9fa;
  border-radius: 8px;
  transition: opacity 0.2s;
}

.rule-item.inactive {
  opacity: 0.5;
}

.rule-toggle {
  flex-shrink: 0;
}

.toggle-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 700;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #e0e0e0;
  color: #666;
  min-width: 36px;
}

.toggle-btn.active {
  background: #22c55e;
  color: white;
}

.rule-content {
  flex: 1;
  min-width: 0;
}

.rule-name {
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 0.25rem;
}

.rule-description {
  font-size: 0.8125rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.rule-description .trigger {
  background: #e0e7ff;
  color: #4338ca;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.rule-description .arrow {
  color: #999;
}

.rule-description .action {
  background: #fef3c7;
  color: #92400e;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.rule-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
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

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}
</style>
