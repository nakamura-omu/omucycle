<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  group: {
    id: string
    name: string
    slug: string | null
  } | null
  groupSlug: string | undefined
}>()

const emit = defineEmits<{
  updated: [group: any]
}>()

const router = useRouter()

const groupSettings = ref({
  name: '',
  slug: '',
})
const isEditing = ref(false)
const slugError = ref('')

watch(() => props.group, () => {
  loadSettings()
}, { immediate: true })

function loadSettings() {
  if (props.group) {
    groupSettings.value = {
      name: props.group.name,
      slug: props.group.slug || '',
    }
  }
}

function validateSlug(slug: string): boolean {
  if (!slug) return true
  const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
  return pattern.test(slug)
}

async function saveSettings() {
  if (!validateSlug(groupSettings.value.slug)) {
    slugError.value = '英小文字、数字、ハイフンのみ使用可能です（例: dx-suishin）'
    return
  }
  slugError.value = ''

  try {
    const res = await fetch(`/api/groups/${props.group?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupSettings.value.name,
        slug: groupSettings.value.slug || null,
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      emit('updated', updated)
      isEditing.value = false

      if (updated.slug && updated.slug !== props.groupSlug) {
        router.replace(`/${updated.slug}/settings`)
      }
    } else {
      const err = await res.json()
      if (err.error?.includes('UNIQUE constraint')) {
        slugError.value = 'このスラッグは既に使用されています'
      } else {
        alert(err.error || '保存に失敗しました')
      }
    }
  } catch (error) {
    console.error('Failed to save group settings:', error)
  }
}

function cancelEdit() {
  isEditing.value = false
  loadSettings()
}
</script>

<template>
  <section class="settings-section">
    <div class="section-header">
      <h3>基本設定</h3>
      <div class="section-actions">
        <button
          v-if="!isEditing"
          class="btn btn-secondary"
          @click="isEditing = true"
        >
          編集
        </button>
        <template v-else>
          <button class="btn btn-secondary" @click="cancelEdit">
            キャンセル
          </button>
          <button class="btn btn-primary" @click="saveSettings">
            保存
          </button>
        </template>
      </div>
    </div>

    <div class="settings-form">
      <div class="form-group">
        <label>グループ名</label>
        <input
          v-if="isEditing"
          v-model="groupSettings.name"
          type="text"
          placeholder="グループ名"
        />
        <span v-else class="form-value">{{ group?.name }}</span>
      </div>

      <div class="form-group">
        <label>URL スラッグ</label>
        <div v-if="isEditing" class="slug-input-wrapper">
          <span class="slug-prefix">{{ window.location.origin }}/</span>
          <input
            v-model="groupSettings.slug"
            type="text"
            placeholder="dx-suishin"
            class="slug-input"
          />
        </div>
        <span v-else class="form-value">
          <template v-if="group?.slug">
            {{ window.location.origin }}/{{ group.slug }}
          </template>
          <template v-else>
            <span class="text-muted">未設定</span>
          </template>
        </span>
        <p v-if="slugError" class="error-text">{{ slugError }}</p>
        <p class="help-text">英小文字、数字、ハイフンが使えます（例: dx-suishin）</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 0.5rem;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  margin-bottom: 0;
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

.form-value {
  font-size: 0.875rem;
  color: #333;
}

.slug-input-wrapper {
  display: flex;
  align-items: center;
}

.slug-prefix {
  font-size: 0.875rem;
  color: #666;
  background: #f5f5f5;
  padding: 0.625rem 0.5rem;
  border: 1px solid #ddd;
  border-right: none;
  border-radius: 6px 0 0 6px;
}

.slug-input {
  flex: 1;
  border-radius: 0 6px 6px 0 !important;
}

.help-text {
  font-size: 0.75rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.error-text {
  font-size: 0.75rem;
  color: #dc2626;
  margin: 0.25rem 0 0 0;
}

.text-muted {
  color: #999;
  font-style: italic;
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
