<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  jobId: string
  templateCount: number
  currentUserId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'created': [instance: { id: string; task_count: number }]
}>()

const form = ref({
  fiscal_year: new Date().getFullYear(),
  actual_start: new Date().toISOString().split('T')[0],
})

watch(() => props.modelValue, (show) => {
  if (show) {
    form.value = {
      fiscal_year: new Date().getFullYear(),
      actual_start: new Date().toISOString().split('T')[0],
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function instantiate() {
  try {
    const res = await fetch(`/api/job-definitions/${props.jobId}/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscal_year: form.value.fiscal_year,
        actual_start: form.value.actual_start,
        created_by: props.currentUserId,
      }),
    })

    if (res.ok) {
      const instance = await res.json()
      emit('created', instance)
      close()
    } else {
      const err = await res.json()
      alert(err.error || 'インスタンス化に失敗しました')
    }
  } catch (error) {
    console.error('Failed to instantiate:', error)
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h2>タスクを生成</h2>
      <p class="modal-description">
        この業務定義からタスクを一括生成します。
        {{ templateCount }}件のタスクが作成されます。
      </p>

      <div class="form-row">
        <div class="form-group">
          <label>年度</label>
          <input
            v-model.number="form.fiscal_year"
            type="number"
            min="2020"
            max="2100"
          />
        </div>
        <div class="form-group">
          <label>開始日</label>
          <input
            v-model="form.actual_start"
            type="date"
          />
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="close">
          キャンセル
        </button>
        <button class="btn btn-primary" @click="instantiate">
          生成
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
  max-width: 400px;
}

.modal h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
}

.modal-description {
  color: #666;
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
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

.form-group input {
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
