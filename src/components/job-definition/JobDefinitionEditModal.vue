<script setup lang="ts">
import { ref, watch } from 'vue'

interface JobDefinition {
  id: string
  name: string
  prefix: string | null
  description: string | null
  category: string | null
  typical_start_month: number | null
  typical_duration_days: number | null
}

const props = defineProps<{
  modelValue: boolean
  job: JobDefinition | null
  currentUserId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const editingJobData = ref({
  name: '',
  prefix: '',
  description: '',
  category: '',
  typical_start_month: null as number | null,
  typical_duration_days: null as number | null,
})

const monthNames = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
]

watch(() => props.modelValue, (show) => {
  if (show && props.job) {
    editingJobData.value = {
      name: props.job.name,
      prefix: props.job.prefix || '',
      description: props.job.description || '',
      category: props.job.category || '',
      typical_start_month: props.job.typical_start_month,
      typical_duration_days: props.job.typical_duration_days,
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (!editingJobData.value.name.trim() || !props.job) return

  try {
    const res = await fetch(`/api/job-definitions/${props.job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingJobData.value.name.trim(),
        prefix: editingJobData.value.prefix?.toUpperCase() || null,
        description: editingJobData.value.description || null,
        category: editingJobData.value.category || null,
        typical_start_month: editingJobData.value.typical_start_month,
        typical_duration_days: editingJobData.value.typical_duration_days,
        updated_by: props.currentUserId,
      }),
    })

    if (res.ok) {
      emit('saved')
      close()
    } else {
      const err = await res.json()
      alert(err.error || '更新に失敗しました')
    }
  } catch (error) {
    console.error('Failed to update job:', error)
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h2>業務定義を編集</h2>

      <div class="form-group">
        <label>業務名 *</label>
        <input
          v-model="editingJobData.name"
          type="text"
          placeholder="例: 年度末決算業務"
        />
      </div>

      <div class="form-group">
        <label>URL用プレフィックス</label>
        <input
          v-model="editingJobData.prefix"
          type="text"
          placeholder="例: KESSAN"
          class="prefix-input"
        />
        <span class="help-text">大文字英字のみ。URLで /グループ/KESSAN-1 のように使われます</span>
      </div>

      <div class="form-group">
        <label>カテゴリ</label>
        <input
          v-model="editingJobData.category"
          type="text"
          placeholder="例: 経理系"
        />
      </div>

      <div class="form-group">
        <label>説明</label>
        <textarea
          v-model="editingJobData.description"
          rows="3"
          placeholder="業務の概要を入力"
        ></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>開始月</label>
          <select v-model="editingJobData.typical_start_month">
            <option :value="null">未設定</option>
            <option v-for="(name, index) in monthNames" :key="index" :value="index + 1">
              {{ name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>期間（日数）</label>
          <input
            v-model.number="editingJobData.typical_duration_days"
            type="number"
            min="1"
            placeholder="例: 30"
          />
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="close">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="save">
          保存
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

.prefix-input {
  text-transform: uppercase;
  font-family: monospace;
}

.help-text {
  display: block;
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.25rem;
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
