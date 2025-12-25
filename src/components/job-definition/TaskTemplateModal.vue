<script setup lang="ts">
import { ref, watch, computed } from 'vue'

interface TaskTemplate {
  id: string
  title: string
  description: string | null
  relative_days: number
  default_assignee_id: string | null
  default_assignee_ids: string[] | null
  sort_order: number
  parent_template_id: string | null
}

interface Member {
  id: string
  name: string
}

const props = defineProps<{
  modelValue: boolean
  mode: 'add' | 'edit'
  jobId: string
  template?: TaskTemplate | null
  parentTemplateId?: string
  parentTemplateName?: string
  members: Member[]
  templateCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const formData = ref({
  title: '',
  description: '',
  relative_days: 0,
  parent_template_id: '',
  default_assignee_ids: [] as string[],
  sort_order: 0,
})

const modalTitle = computed(() => props.mode === 'add' ? 'タスクを追加' : 'タスクを編集')

watch(() => props.modelValue, (show) => {
  if (show) {
    if (props.mode === 'edit' && props.template) {
      // 編集モード: テンプレートデータをロード
      let assigneeIds: string[] = []
      if (props.template.default_assignee_ids) {
        assigneeIds = props.template.default_assignee_ids
      } else if (props.template.default_assignee_id) {
        assigneeIds = [props.template.default_assignee_id]
      }
      formData.value = {
        title: props.template.title,
        description: props.template.description || '',
        relative_days: props.template.relative_days,
        parent_template_id: props.template.parent_template_id || '',
        default_assignee_ids: assigneeIds,
        sort_order: props.template.sort_order,
      }
    } else {
      // 追加モード: 初期化
      formData.value = {
        title: '',
        description: '',
        relative_days: 0,
        parent_template_id: props.parentTemplateId || '',
        default_assignee_ids: [],
        sort_order: props.templateCount + 1,
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (!formData.value.title.trim()) return

  try {
    const url = props.mode === 'add'
      ? `/api/job-definitions/${props.jobId}/templates`
      : `/api/job-definitions/templates/${props.template?.id}`

    const method = props.mode === 'add' ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.value.title.trim(),
        description: formData.value.description || null,
        relative_days: formData.value.relative_days,
        parent_template_id: props.mode === 'add' ? (formData.value.parent_template_id || null) : undefined,
        default_assignee_ids: formData.value.default_assignee_ids.length > 0 ? formData.value.default_assignee_ids : null,
        sort_order: formData.value.sort_order,
      }),
    })

    if (res.ok) {
      emit('saved')
      close()
    } else {
      const err = await res.json()
      alert(err.error || (props.mode === 'add' ? 'タスク追加に失敗しました' : '更新に失敗しました'))
    }
  } catch (error) {
    console.error('Failed to save template:', error)
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h2>{{ modalTitle }}</h2>

      <div class="form-group">
        <label>タスク名 *</label>
        <input
          v-model="formData.title"
          type="text"
          placeholder="例: 書類準備"
        />
      </div>

      <div class="form-group">
        <label>説明</label>
        <textarea
          v-model="formData.description"
          rows="2"
          placeholder="タスクの詳細説明"
        ></textarea>
      </div>

      <div class="form-group">
        <label>期限（業務開始から何日後）</label>
        <input
          v-model.number="formData.relative_days"
          type="number"
          min="0"
          class="input-small"
        />
      </div>

      <div class="form-group">
        <label>担当者（複数選択可）</label>
        <div class="checkbox-list">
          <label v-for="member in members" :key="member.id" class="checkbox-item">
            <input
              type="checkbox"
              :value="member.id"
              v-model="formData.default_assignee_ids"
            />
            {{ member.name }}
          </label>
        </div>
      </div>

      <div v-if="mode === 'add' && parentTemplateName" class="form-group">
        <label>親タスク</label>
        <span class="parent-info">{{ parentTemplateName }}</span>
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

.input-small {
  width: 100px !important;
}

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: white;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  margin-bottom: 0 !important;
}

.checkbox-item input {
  width: auto !important;
  margin: 0;
}

.parent-info {
  display: block;
  padding: 0.625rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #666;
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
