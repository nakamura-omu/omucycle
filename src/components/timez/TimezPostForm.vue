<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  'submit': [content: string]
}>()

const content = ref('')
const maxLength = 280

const remainingChars = computed(() => maxLength - content.value.length)
const isOverLimit = computed(() => remainingChars.value < 0)
const canSubmit = computed(() => content.value.trim().length > 0 && !isOverLimit.value && !props.disabled)

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', content.value.trim())
  content.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    handleSubmit()
  }
}
</script>

<template>
  <div class="post-form">
    <textarea
      v-model="content"
      placeholder="今何してる？ #ハッシュタグ も使えます"
      :maxlength="maxLength + 50"
      @keydown="handleKeydown"
    ></textarea>
    <div class="form-footer">
      <span
        class="char-count"
        :class="{ warning: remainingChars < 20, danger: isOverLimit }"
      >
        {{ remainingChars }}
      </span>
      <button
        class="btn btn-primary"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        投稿
      </button>
    </div>
  </div>
</template>

<style scoped>
.post-form {
  background: white;
  border-radius: 8px;
  padding: 1rem;
}

textarea {
  width: 100%;
  min-height: 80px;
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.9375rem;
  resize: none;
  font-family: inherit;
}

textarea:focus {
  outline: none;
  border-color: #4cc9f0;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.char-count {
  font-size: 0.8125rem;
  color: #999;
}

.char-count.warning {
  color: #f59e0b;
}

.char-count.danger {
  color: #dc2626;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}
</style>
