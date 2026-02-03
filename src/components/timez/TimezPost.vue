<script setup lang="ts">
import { computed } from 'vue'
import type { TimezPost } from '@/stores/timez'

const props = defineProps<{
  post: TimezPost
  currentUserId?: string
}>()

const emit = defineEmits<{
  'click': [post: TimezPost]
  'hashtag-click': [hashtag: string]
  'delete': [post: TimezPost]
}>()

// 投稿内容をハッシュタグ付きでレンダリング
const renderedContent = computed(() => {
  let content = props.post.content
  // ハッシュタグをリンク化
  const pattern = /[#＃]([a-zA-Z_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF][a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]*)/g
  content = content.replace(pattern, '<span class="hashtag" data-tag="$1">#$1</span>')
  return content
})

// 相対時間表示
const relativeTime = computed(() => {
  const date = new Date(props.post.created_at)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '今'
  if (minutes < 60) return `${minutes}分前`
  if (hours < 24) return `${hours}時間前`
  if (days < 7) return `${days}日前`
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
})

// アバター色を名前から生成
const avatarColor = computed(() => {
  const name = props.post.user_name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = hash % 360
  return `hsl(${hue}, 60%, 60%)`
})

const avatarInitial = computed(() => {
  return props.post.user_name.charAt(0)
})

const isOwner = computed(() => {
  return props.currentUserId === props.post.user_id
})

function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.classList.contains('hashtag')) {
    const tag = target.dataset.tag
    if (tag) {
      e.stopPropagation()
      emit('hashtag-click', tag)
    }
  }
}

function handleDelete(e: MouseEvent) {
  e.stopPropagation()
  if (confirm('この投稿を削除しますか？')) {
    emit('delete', props.post)
  }
}
</script>

<template>
  <div class="timez-post" @click="$emit('click', post)">
    <div class="post-avatar" :style="{ backgroundColor: avatarColor }">
      {{ avatarInitial }}
    </div>
    <div class="post-body">
      <div class="post-header">
        <span class="user-name">{{ post.user_name }}</span>
        <span class="post-time">{{ relativeTime }}</span>
        <button
          v-if="isOwner"
          class="delete-btn"
          @click="handleDelete"
          title="削除"
        >
          ×
        </button>
      </div>
      <div
        class="post-content"
        v-html="renderedContent"
        @click="handleContentClick"
      ></div>
      <div class="post-footer">
        <span class="comment-count">
          💬 {{ post.comment_count }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timez-post {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.timez-post:hover {
  background: #f8f9fa;
}

.post-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1rem;
  flex-shrink: 0;
}

.post-body {
  flex: 1;
  min-width: 0;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.user-name {
  font-weight: 600;
  color: #1a1a2e;
}

.post-time {
  font-size: 0.8125rem;
  color: #999;
}

.delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.timez-post:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #dc2626;
}

.post-content {
  color: #333;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.post-content :deep(.hashtag) {
  color: #4338ca;
  cursor: pointer;
}

.post-content :deep(.hashtag:hover) {
  text-decoration: underline;
}

.post-footer {
  margin-top: 0.5rem;
  display: flex;
  gap: 1rem;
}

.comment-count {
  font-size: 0.8125rem;
  color: #666;
}
</style>
