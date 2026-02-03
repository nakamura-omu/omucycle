<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimezStore, type TimelineFilter, type TimezPost } from '@/stores/timez'
import { useUserStore } from '@/stores/user'
import { useGroupsStore } from '@/stores/groups'
import TimezPostComponent from '@/components/timez/TimezPost.vue'
import TimezPostForm from '@/components/timez/TimezPostForm.vue'
import TimezTrending from '@/components/timez/TimezTrending.vue'

const route = useRoute()
const router = useRouter()
const timezStore = useTimezStore()
const userStore = useUserStore()
const groupsStore = useGroupsStore()

const showPostDetail = ref(false)
const selectedPost = ref<(TimezPost & { comments: any[] }) | null>(null)
const newComment = ref('')

// ユーザーが所属するグループ
const userGroups = computed(() => groupsStore.groups)

// フィルターオプション
const filterOptions = computed<TimelineFilter[]>(() => {
  const options: TimelineFilter[] = [
    { type: 'global', label: '全体' },
  ]
  for (const group of userGroups.value) {
    options.push({
      type: 'group',
      value: group.id,
      label: group.name,
    })
  }
  return options
})

// ルートからハッシュタグフィルタを取得
const hashtagFromRoute = computed(() => route.params.hashtag as string | undefined)

async function loadData() {
  const filter = timezStore.activeFilter
  if (hashtagFromRoute.value) {
    timezStore.setFilter({ type: 'hashtag', value: hashtagFromRoute.value, label: `#${hashtagFromRoute.value}` })
    await timezStore.fetchPosts({ hashtag: hashtagFromRoute.value })
  } else if (filter.type === 'group' && filter.value) {
    await timezStore.fetchPosts({ group_id: filter.value })
  } else if (filter.type === 'job_instance' && filter.value) {
    await timezStore.fetchPosts({ job_instance_id: filter.value })
  } else if (filter.type === 'hashtag' && filter.value) {
    await timezStore.fetchPosts({ hashtag: filter.value })
  } else {
    await timezStore.fetchPosts()
  }
  await timezStore.fetchTrending()
}

function selectFilter(filter: TimelineFilter) {
  timezStore.setFilter(filter)
  if (filter.type === 'hashtag' && filter.value) {
    router.push(`/timez/tag/${filter.value}`)
  } else {
    router.push('/timez')
  }
  loadData()
}

function handleHashtagClick(hashtag: string) {
  timezStore.setFilter({ type: 'hashtag', value: hashtag, label: `#${hashtag}` })
  router.push(`/timez/tag/${hashtag}`)
  loadData()
}

async function handlePostSubmit(content: string) {
  if (!userStore.currentUser) return
  await timezStore.createPost(userStore.currentUser.id, content)
}

async function handlePostDelete(post: TimezPost) {
  await timezStore.deletePost(post.id)
}

async function openPostDetail(post: TimezPost) {
  await timezStore.fetchPost(post.id)
  selectedPost.value = timezStore.currentPost
  showPostDetail.value = true
}

function closePostDetail() {
  showPostDetail.value = false
  selectedPost.value = null
}

async function submitComment() {
  if (!selectedPost.value || !userStore.currentUser || !newComment.value.trim()) return
  await timezStore.addComment(selectedPost.value.id, userStore.currentUser.id, newComment.value.trim())
  newComment.value = ''
}

// ルート変更を監視
watch(() => route.params.hashtag, () => {
  loadData()
})

onMounted(() => {
  groupsStore.fetchGroups()
  loadData()
})
</script>

<template>
  <div class="timez-page">
    <!-- 左サイドバー: フィルター -->
    <aside class="filter-sidebar">
      <h2>タイムライン</h2>
      <nav class="filter-nav">
        <button
          v-for="option in filterOptions"
          :key="option.type + (option.value || '')"
          class="filter-btn"
          :class="{ active: timezStore.activeFilter.type === option.type && timezStore.activeFilter.value === option.value }"
          @click="selectFilter(option)"
        >
          {{ option.label }}
        </button>
      </nav>

      <div v-if="timezStore.activeFilter.type === 'hashtag'" class="current-tag">
        <span class="tag-label">タグ</span>
        <span class="tag-name">#{{ timezStore.activeFilter.value }}</span>
        <button class="clear-btn" @click="selectFilter({ type: 'global', label: '全体' })">×</button>
      </div>
    </aside>

    <!-- メインタイムライン -->
    <main class="timeline-main">
      <!-- 投稿フォーム -->
      <TimezPostForm
        :disabled="!userStore.currentUser"
        @submit="handlePostSubmit"
      />

      <!-- 投稿一覧 -->
      <div v-if="timezStore.isLoading" class="loading">読み込み中...</div>
      <div v-else-if="timezStore.posts.length === 0" class="empty">
        <p>投稿がありません</p>
        <p class="hint">最初の投稿をしてみましょう！</p>
      </div>
      <div v-else class="posts-list">
        <TimezPostComponent
          v-for="post in timezStore.posts"
          :key="post.id"
          :post="post"
          :current-user-id="userStore.currentUser?.id"
          @click="openPostDetail"
          @hashtag-click="handleHashtagClick"
          @delete="handlePostDelete"
        />
      </div>
    </main>

    <!-- 右サイドバー: トレンド -->
    <aside class="trending-sidebar">
      <TimezTrending
        :trending="timezStore.trending"
        @hashtag-click="handleHashtagClick"
      />
    </aside>

    <!-- 投稿詳細モーダル -->
    <div v-if="showPostDetail && selectedPost" class="modal-overlay" @click.self="closePostDetail">
      <div class="post-detail-modal">
        <button class="close-btn" @click="closePostDetail">×</button>

        <div class="modal-post">
          <TimezPostComponent
            :post="selectedPost"
            :current-user-id="userStore.currentUser?.id"
            @hashtag-click="handleHashtagClick"
            @delete="handlePostDelete"
          />
        </div>

        <div class="comments-section">
          <h3>コメント ({{ selectedPost.comments?.length || 0 }})</h3>

          <div v-if="selectedPost.comments?.length === 0" class="no-comments">
            コメントはまだありません
          </div>
          <div v-else class="comments-list">
            <div
              v-for="comment in selectedPost.comments"
              :key="comment.id"
              class="comment"
            >
              <span class="comment-author">{{ comment.user_name }}</span>
              <span class="comment-content">{{ comment.content }}</span>
              <span class="comment-time">
                {{ new Date(comment.created_at).toLocaleString('ja-JP') }}
              </span>
            </div>
          </div>

          <div class="comment-form">
            <input
              v-model="newComment"
              type="text"
              placeholder="コメントを入力..."
              @keyup.enter="submitComment"
            />
            <button class="btn btn-primary" @click="submitComment">送信</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timez-page {
  display: grid;
  grid-template-columns: 200px 1fr 250px;
  gap: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  min-height: calc(100vh - 60px);
}

/* 左サイドバー */
.filter-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
}

.filter-sidebar h2 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0 0 1rem 0;
}

.filter-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-btn {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
  transition: background-color 0.15s;
}

.filter-btn:hover {
  background: #f0f0f0;
}

.filter-btn.active {
  background: #e0e7ff;
  color: #4338ca;
  font-weight: 500;
}

.current-tag {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tag-label {
  font-size: 0.75rem;
  color: #999;
}

.tag-name {
  color: #4338ca;
  font-weight: 500;
  flex: 1;
}

.clear-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 1rem;
}

.clear-btn:hover {
  color: #dc2626;
}

/* メインタイムライン */
.timeline-main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.loading, .empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty .hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.5rem;
}

.posts-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* 右サイドバー */
.trending-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
}

/* モーダル */
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

.post-detail-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  z-index: 10;
}

.close-btn:hover {
  color: #333;
}

.modal-post {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-post :deep(.timez-post) {
  cursor: default;
}

.modal-post :deep(.timez-post:hover) {
  background: white;
}

.comments-section {
  padding: 1rem;
}

.comments-section h3 {
  font-size: 0.9375rem;
  color: #1a1a2e;
  margin: 0 0 1rem 0;
}

.no-comments {
  color: #999;
  font-size: 0.875rem;
  padding: 1rem;
  text-align: center;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.comment {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.comment-author {
  font-weight: 600;
  font-size: 0.875rem;
  color: #1a1a2e;
}

.comment-content {
  color: #333;
  font-size: 0.875rem;
}

.comment-time {
  font-size: 0.75rem;
  color: #999;
}

.comment-form {
  display: flex;
  gap: 0.5rem;
}

.comment-form input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
}

.comment-form input:focus {
  outline: none;
  border-color: #4cc9f0;
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

/* レスポンシブ */
@media (max-width: 900px) {
  .timez-page {
    grid-template-columns: 1fr;
  }

  .filter-sidebar,
  .trending-sidebar {
    display: none;
  }
}
</style>
