<script setup lang="ts">
import { ref, watch, computed } from 'vue'

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

interface HistoryEntry {
  id: string
  task_id: string
  user_id: string
  user_name: string
  action_type: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

const EMOJI_OPTIONS = ['👍', '❤️', '😊', '👀', '🎉']

const props = defineProps<{
  taskId: string
  currentUserId: string
  statuses?: { key: string; label: string }[]
}>()

const comments = ref<Comment[]>([])
const history = ref<HistoryEntry[]>([])
const newComment = ref('')
const isLoading = ref(false)
const isSending = ref(false)
const showHistory = ref(false)

// コメントと履歴を統合した表示用リスト
const timelineItems = computed(() => {
  if (!showHistory.value) {
    return comments.value.map(c => ({ type: 'comment' as const, data: c, created_at: c.created_at }))
  }

  const items: { type: 'comment' | 'history'; data: Comment | HistoryEntry; created_at: string }[] = []

  for (const c of comments.value) {
    items.push({ type: 'comment', data: c, created_at: c.created_at })
  }
  for (const h of history.value) {
    items.push({ type: 'history', data: h, created_at: h.created_at })
  }

  // 時系列でソート（古い順）
  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return items
})

async function fetchHistory() {
  try {
    const res = await fetch(`/api/tasks/${props.taskId}/history`)
    if (res.ok) {
      history.value = await res.json()
    }
  } catch (error) {
    console.error('Failed to fetch history:', error)
  }
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    status: 'ステータス',
    priority: '優先度',
    title: 'タイトル',
    description: '説明',
    assignee_id: '担当者',
    assignee_ids: '担当者',
    start_date: '開始日',
    due_date: '期限日',
  }
  return labels[field] || field
}

function getStatusLabel(key: string | null): string {
  if (!key) return '(なし)'
  const status = props.statuses?.find(s => s.key === key)
  return status?.label || key
}

function getPriorityLabel(key: string | null): string {
  if (!key) return '(なし)'
  const labels: Record<string, string> = {
    urgent: '緊急',
    important: '重要',
    normal: '通常',
    none: 'なし',
  }
  return labels[key] || key
}

function formatHistoryValue(field: string | null, value: string | null): string {
  if (!value) return '(なし)'
  if (field === 'status') return getStatusLabel(value)
  if (field === 'priority') return getPriorityLabel(value)
  return value
}

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
    fetchHistory()
  }
}, { immediate: true })

watch(showHistory, (val) => {
  if (val && history.value.length === 0) {
    fetchHistory()
  }
})
</script>

<template>
  <div class="task-comments">
    <div class="comments-header">
      <span>コメント</span>
      <span class="comment-count">{{ comments.length }}</span>
      <label class="history-toggle">
        <input type="checkbox" v-model="showHistory" />
        <span>履歴を表示</span>
      </label>
    </div>

    <div class="comments-list">
      <div v-if="isLoading" class="comments-loading">読み込み中...</div>
      <div v-else-if="timelineItems.length === 0" class="comments-empty">
        コメントはまだありません
      </div>
      <template v-else>
        <template v-for="item in timelineItems" :key="item.data.id">
          <!-- コメント -->
          <div
            v-if="item.type === 'comment'"
            class="comment-item"
            :class="{
              'ai-comment': (item.data as Comment).is_ai_generated,
              'my-comment': (item.data as Comment).user_id === props.currentUserId
            }"
          >
            <div class="comment-header">
              <span class="comment-author">{{ (item.data as Comment).user_name }}</span>
              <span class="comment-time">{{ formatTime(item.created_at) }}</span>
            </div>
            <div class="comment-content">{{ (item.data as Comment).content }}</div>
            <div class="comment-reactions">
              <button
                v-for="reaction in (item.data as Comment).reactions"
                :key="reaction.emoji"
                class="reaction-badge"
                :class="{ 'my-reaction': hasReacted(item.data as Comment, reaction.emoji) }"
                @click="toggleReaction(item.data as Comment, reaction.emoji)"
              >
                {{ reaction.emoji }} {{ reaction.count }}
              </button>
              <button class="add-reaction-btn" @click="toggleEmojiPicker((item.data as Comment).id)">+</button>
              <div v-if="showEmojiPicker === (item.data as Comment).id" class="emoji-picker">
                <button
                  v-for="emoji in EMOJI_OPTIONS"
                  :key="emoji"
                  class="emoji-option"
                  @click="toggleReaction(item.data as Comment, emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>
          </div>
          <!-- 履歴 -->
          <div v-else class="history-item">
            <div class="history-icon">📝</div>
            <div class="history-content">
              <span class="history-user">{{ (item.data as HistoryEntry).user_name }}</span>
              が
              <span class="history-field">{{ getFieldLabel((item.data as HistoryEntry).field_name || '') }}</span>
              を
              <span class="history-old">{{ formatHistoryValue((item.data as HistoryEntry).field_name, (item.data as HistoryEntry).old_value) }}</span>
              から
              <span class="history-new">{{ formatHistoryValue((item.data as HistoryEntry).field_name, (item.data as HistoryEntry).new_value) }}</span>
              に変更
            </div>
            <div class="history-time">{{ formatTime(item.created_at) }}</div>
          </div>
        </template>
      </template>
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

/* 履歴トグル */
.history-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
  font-size: 0.75rem;
  color: #666;
  cursor: pointer;
  user-select: none;
}

.history-toggle input {
  margin: 0;
  cursor: pointer;
}

/* 履歴アイテム */
.history-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: #fefce8;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  border-left: 3px solid #facc15;
}

.history-icon {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.history-content {
  flex: 1;
  font-size: 0.75rem;
  color: #666;
  line-height: 1.5;
}

.history-user {
  font-weight: 600;
  color: #1a1a2e;
}

.history-field {
  color: #4338ca;
}

.history-old {
  text-decoration: line-through;
  color: #999;
}

.history-new {
  color: #16a34a;
  font-weight: 500;
}

.history-time {
  font-size: 0.65rem;
  color: #999;
  flex-shrink: 0;
}
</style>
