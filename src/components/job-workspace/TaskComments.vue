<script setup lang="ts">
import { ref, watch } from 'vue'

interface Reaction {
  emoji: string
  count: number
  user_ids: string[]
}

interface Comment {
  id: string
  task_id: string
  user_id: string
  user_name: string
  content: string
  is_ai_generated: boolean
  created_at: string
  reactions: Reaction[]
}

const EMOJI_OPTIONS = ['👍', '❤️', '😊', '👀', '🎉']

const props = defineProps<{
  taskId: string
  currentUserId: string
}>()

const comments = ref<Comment[]>([])
const newComment = ref('')
const isLoading = ref(false)
const isSending = ref(false)

async function fetchComments() {
  isLoading.value = true
  try {
    const res = await fetch(`/api/tasks/${props.taskId}/comments`)
    if (res.ok) {
      comments.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch comments:', error)
  } finally {
    isLoading.value = false
  }
}

async function sendComment() {
  if (!newComment.value.trim() || !props.currentUserId) return

  isSending.value = true
  try {
    const res = await fetch(`/api/tasks/${props.taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: props.currentUserId,
        content: newComment.value.trim(),
      }),
    })
    if (res.ok) {
      const comment = await res.json()
      comments.value.push(comment)
      newComment.value = ''
    }
  } catch (error) {
    console.error('Failed to send comment:', error)
  } finally {
    isSending.value = false
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP')
}

const showEmojiPicker = ref<string | null>(null)

function toggleEmojiPicker(commentId: string) {
  showEmojiPicker.value = showEmojiPicker.value === commentId ? null : commentId
}

async function toggleReaction(comment: Comment, emoji: string) {
  showEmojiPicker.value = null
  try {
    const res = await fetch(`/api/tasks/comments/${comment.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: props.currentUserId,
        emoji,
      }),
    })
    if (res.ok) {
      const result = await res.json()
      const existingIdx = comment.reactions.findIndex(r => r.emoji === emoji)

      if (result.action === 'added') {
        if (existingIdx !== -1) {
          comment.reactions[existingIdx].count++
          comment.reactions[existingIdx].user_ids.push(props.currentUserId)
        } else {
          comment.reactions.push({ emoji, count: 1, user_ids: [props.currentUserId] })
        }
      } else {
        if (existingIdx !== -1) {
          comment.reactions[existingIdx].count--
          comment.reactions[existingIdx].user_ids = comment.reactions[existingIdx].user_ids.filter(
            id => id !== props.currentUserId
          )
          if (comment.reactions[existingIdx].count === 0) {
            comment.reactions.splice(existingIdx, 1)
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle reaction:', error)
  }
}

function hasReacted(comment: Comment, emoji: string): boolean {
  const reaction = comment.reactions.find(r => r.emoji === emoji)
  return reaction ? reaction.user_ids.includes(props.currentUserId) : false
}

watch(() => props.taskId, () => {
  if (props.taskId) {
    fetchComments()
  }
}, { immediate: true })
</script>

<template>
  <div class="task-comments">
    <div class="comments-header">
      <span>コメント</span>
      <span class="comment-count">{{ comments.length }}</span>
    </div>

    <div class="comments-list">
      <div v-if="isLoading" class="comments-loading">読み込み中...</div>
      <div v-else-if="comments.length === 0" class="comments-empty">
        コメントはまだありません
      </div>
      <div
        v-else
        v-for="comment in comments"
        :key="comment.id"
        class="comment-item"
        :class="{
          'ai-comment': comment.is_ai_generated,
          'my-comment': comment.user_id === props.currentUserId
        }"
      >
        <div class="comment-header">
          <span class="comment-author">{{ comment.user_name }}</span>
          <span class="comment-time">{{ formatTime(comment.created_at) }}</span>
        </div>
        <div class="comment-content">{{ comment.content }}</div>
        <div class="comment-reactions">
          <button
            v-for="reaction in comment.reactions"
            :key="reaction.emoji"
            class="reaction-badge"
            :class="{ 'my-reaction': hasReacted(comment, reaction.emoji) }"
            @click="toggleReaction(comment, reaction.emoji)"
          >
            {{ reaction.emoji }} {{ reaction.count }}
          </button>
          <button class="add-reaction-btn" @click="toggleEmojiPicker(comment.id)">+</button>
          <div v-if="showEmojiPicker === comment.id" class="emoji-picker">
            <button
              v-for="emoji in EMOJI_OPTIONS"
              :key="emoji"
              class="emoji-option"
              @click="toggleReaction(comment, emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="comment-input-area">
      <textarea
        v-model="newComment"
        class="comment-input"
        placeholder="コメントを入力..."
        rows="2"
        @keydown.enter.ctrl="sendComment"
        @keydown.enter.meta="sendComment"
      ></textarea>
      <button
        class="send-btn"
        :disabled="!newComment.trim() || isSending"
        @click="sendComment"
      >
        {{ isSending ? '...' : '送信' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.task-comments {
  width: 300px;
  min-width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  overflow: hidden;
}

.comments-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e0e0e0;
  font-weight: 600;
  font-size: 0.875rem;
  color: #1a1a2e;
}

.comment-count {
  font-size: 0.75rem;
  background: #e0e7ff;
  color: #4338ca;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  font-weight: 500;
}

.comments-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.comments-loading,
.comments-empty {
  text-align: center;
  color: #999;
  font-size: 0.8125rem;
  padding: 2rem 1rem;
}

.comment-item {
  background: white;
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.comment-item.ai-comment {
  background: #f0fdf4;
  border-left: 3px solid #22c55e;
}

.comment-item.my-comment {
  background: #eff6ff;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.comment-author {
  font-weight: 600;
  font-size: 0.8125rem;
  color: #1a1a2e;
}

.comment-time {
  font-size: 0.7rem;
  color: #999;
}

.comment-content {
  font-size: 0.8125rem;
  color: #333;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-input-area {
  padding: 0.75rem;
  border-top: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.8125rem;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.comment-input:focus {
  border-color: #4cc9f0;
}

.send-btn {
  align-self: flex-end;
  padding: 0.5rem 1rem;
  background: #4cc9f0;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: #3ab8df;
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* リアクション */
.comment-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
  position: relative;
}

.reaction-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.reaction-badge:hover {
  background: #e0e0e0;
}

.reaction-badge.my-reaction {
  background: #dbeafe;
  border-color: #3b82f6;
}

.add-reaction-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed #ccc;
  border-radius: 50%;
  font-size: 0.75rem;
  color: #999;
  cursor: pointer;
  transition: all 0.15s;
}

.add-reaction-btn:hover {
  border-color: #999;
  color: #666;
  background: #f5f5f5;
}

.emoji-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  display: flex;
  gap: 0.25rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.375rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.emoji-option {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.emoji-option:hover {
  background: #f0f0f0;
}
</style>
