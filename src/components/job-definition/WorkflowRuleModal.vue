<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { WorkflowRule } from './WorkflowRuleList.vue'

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
  modelValue: boolean
  mode: 'add' | 'edit'
  jobId: string
  rule?: WorkflowRule | null
  statuses: GroupStatus[]
  members: Member[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const formData = ref({
  name: '',
  trigger_type: 'status_changed',
  trigger_from_status: '',
  trigger_to_status: '',
  action_type: 'change_assignee',
  action_assignee_ids: [] as string[],
  action_status: '',
})

const modalTitle = computed(() => props.mode === 'add' ? 'ルールを追加' : 'ルールを編集')

watch(() => props.modelValue, (show) => {
  if (show) {
    if (props.mode === 'edit' && props.rule) {
      // 編集モード: ルールデータをロード
      const triggerConfig = props.rule.trigger_config || {}
      const actionConfig = props.rule.action_config || {}

      let assigneeIds: string[] = []
      if (actionConfig.assignee_ids) {
        assigneeIds = actionConfig.assignee_ids
      } else if (actionConfig.assignee_id) {
        assigneeIds = [actionConfig.assignee_id]
      }

      formData.value = {
        name: props.rule.name,
        trigger_type: props.rule.trigger_type,
        trigger_from_status: triggerConfig.from_status || '',
        trigger_to_status: triggerConfig.to_status || '',
        action_type: props.rule.action_type,
        action_assignee_ids: assigneeIds,
        action_status: actionConfig.status || '',
      }
    } else {
      // 追加モード: 初期化
      formData.value = {
        name: '',
        trigger_type: 'status_changed',
        trigger_from_status: '',
        trigger_to_status: '',
        action_type: 'change_assignee',
        action_assignee_ids: [],
        action_status: '',
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (!formData.value.name.trim()) {
    alert('ルール名を入力してください')
    return
  }

  // トリガー設定を構築
  const triggerConfig: any = {}
  if (formData.value.trigger_type === 'status_changed') {
    if (formData.value.trigger_from_status) {
      triggerConfig.from_status = formData.value.trigger_from_status
    }
    if (formData.value.trigger_to_status) {
      triggerConfig.to_status = formData.value.trigger_to_status
    }
  }

  // アクション設定を構築
  const actionConfig: any = {}
  if (formData.value.action_type === 'change_assignee') {
    if (formData.value.action_assignee_ids.length === 0) {
      alert('担当者を選択してください')
      return
    }
    actionConfig.assignee_ids = formData.value.action_assignee_ids
  } else if (formData.value.action_type === 'change_status') {
    if (!formData.value.action_status) {
      alert('ステータスを選択してください')
      return
    }
    actionConfig.status = formData.value.action_status
  }

  try {
    const url = props.mode === 'add'
      ? `/api/job-definitions/${props.jobId}/rules`
      : `/api/workflow-rules/${props.rule?.id}`

    const method = props.mode === 'add' ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.value.name.trim(),
        trigger_type: formData.value.trigger_type,
        trigger_config: Object.keys(triggerConfig).length > 0 ? triggerConfig : null,
        action_type: formData.value.action_type,
        action_config: Object.keys(actionConfig).length > 0 ? actionConfig : null,
      }),
    })

    if (res.ok) {
      emit('saved')
      close()
    } else {
      const err = await res.json()
      alert(err.error || (props.mode === 'add' ? 'ルール追加に失敗しました' : '更新に失敗しました'))
    }
  } catch (error) {
    console.error('Failed to save rule:', error)
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h2>{{ modalTitle }}</h2>

      <div class="form-group">
        <label>ルール名 *</label>
        <input
          v-model="formData.name"
          type="text"
          placeholder="例: 完了時に経理担当へ"
        />
      </div>

      <div class="form-section">
        <h3>トリガー（いつ実行するか）</h3>

        <div class="form-group">
          <label>トリガー種別</label>
          <select v-model="formData.trigger_type">
            <option value="status_changed">ステータス変更時</option>
          </select>
        </div>

        <div v-if="formData.trigger_type === 'status_changed'" class="status-flow">
          <div class="form-group flex-1">
            <label>変更前ステータス</label>
            <select v-model="formData.trigger_from_status">
              <option value="">（任意）</option>
              <option v-for="status in statuses" :key="status.key" :value="status.key">
                {{ status.label }}
              </option>
            </select>
          </div>
          <span class="flow-arrow">→</span>
          <div class="form-group flex-1">
            <label>変更後ステータス</label>
            <select v-model="formData.trigger_to_status">
              <option value="">（任意）</option>
              <option v-for="status in statuses" :key="status.key" :value="status.key">
                {{ status.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="form-section">
        <h3>アクション（何をするか）</h3>

        <div class="form-group">
          <label>アクション種別</label>
          <select v-model="formData.action_type">
            <option value="change_assignee">担当者を変更</option>
            <option value="change_status">ステータスを変更</option>
          </select>
        </div>

        <div v-if="formData.action_type === 'change_assignee'" class="form-group">
          <label>新しい担当者 *</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input
                type="checkbox"
                :value="member.id"
                v-model="formData.action_assignee_ids"
              />
              {{ member.name }}
            </label>
          </div>
        </div>

        <div v-if="formData.action_type === 'change_status'" class="form-group">
          <label>新しいステータス *</label>
          <select v-model="formData.action_status">
            <option value="">選択してください</option>
            <option v-for="status in statuses" :key="status.key" :value="status.key">
              {{ status.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="close">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="save">
          {{ mode === 'add' ? '追加' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.form-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.form-section h3 {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 0.75rem 0;
  font-weight: 500;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.status-flow {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.status-flow .form-group {
  margin-bottom: 0;
}

.flex-1 {
  flex: 1;
}

.flow-arrow {
  color: #999;
  font-size: 1.25rem;
  padding-bottom: 0.5rem;
}

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  margin-bottom: 0 !important;
}

.checkbox-item input {
  width: auto !important;
  margin: 0;
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
</style>
