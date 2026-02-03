import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TimezPost {
  id: string
  user_id: string
  user_name: string
  content: string
  hashtags: string[]
  comment_count: number
  created_at: string
  updated_at: string
}

export interface TimezComment {
  id: string
  post_id: string
  user_id: string
  user_name: string
  content: string
  created_at: string
}

export interface TrendingHashtag {
  hashtag: string
  count: number
}

export type FilterType = 'global' | 'group' | 'job_instance' | 'hashtag'

export interface TimelineFilter {
  type: FilterType
  value?: string
  label?: string
}

export const useTimezStore = defineStore('timez', () => {
  const posts = ref<TimezPost[]>([])
  const currentPost = ref<(TimezPost & { comments: TimezComment[] }) | null>(null)
  const trending = ref<TrendingHashtag[]>([])
  const isLoading = ref(false)
  const activeFilter = ref<TimelineFilter>({ type: 'global' })

  async function fetchPosts(filter?: {
    group_id?: string
    job_instance_id?: string
    hashtag?: string
  }) {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (filter?.group_id) params.set('group_id', filter.group_id)
      if (filter?.job_instance_id) params.set('job_instance_id', filter.job_instance_id)
      if (filter?.hashtag) params.set('hashtag', filter.hashtag)

      const url = `/api/timez/posts${params.toString() ? '?' + params : ''}`
      const res = await fetch(url)
      if (res.ok) {
        posts.value = await res.json()
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPost(postId: string) {
    try {
      const res = await fetch(`/api/timez/posts/${postId}`)
      if (res.ok) {
        currentPost.value = await res.json()
      }
    } catch (error) {
      console.error('Failed to fetch post:', error)
    }
  }

  async function fetchTrending(period: '24h' | '7d' = '24h') {
    try {
      const res = await fetch(`/api/timez/trending?period=${period}`)
      if (res.ok) {
        const data = await res.json()
        trending.value = data.trending
      }
    } catch (error) {
      console.error('Failed to fetch trending:', error)
    }
  }

  async function createPost(userId: string, content: string): Promise<TimezPost | null> {
    try {
      const res = await fetch('/api/timez/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content }),
      })
      if (res.ok) {
        const newPost = await res.json()
        posts.value.unshift(newPost)
        return newPost
      }
    } catch (error) {
      console.error('Failed to create post:', error)
    }
    return null
  }

  async function deletePost(postId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/timez/posts/${postId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        posts.value = posts.value.filter(p => p.id !== postId)
        return true
      }
    } catch (error) {
      console.error('Failed to delete post:', error)
    }
    return false
  }

  async function addComment(postId: string, userId: string, content: string): Promise<TimezComment | null> {
    try {
      const res = await fetch(`/api/timez/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content }),
      })
      if (res.ok) {
        const comment = await res.json()
        // 現在の投稿のコメントに追加
        if (currentPost.value && currentPost.value.id === postId) {
          currentPost.value.comments.push(comment)
        }
        // 投稿一覧のコメント数を更新
        const post = posts.value.find(p => p.id === postId)
        if (post) {
          post.comment_count++
        }
        return comment
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
    return null
  }

  async function deleteComment(postId: string, commentId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/timez/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // 現在の投稿のコメントから削除
        if (currentPost.value && currentPost.value.id === postId) {
          currentPost.value.comments = currentPost.value.comments.filter(c => c.id !== commentId)
        }
        // 投稿一覧のコメント数を更新
        const post = posts.value.find(p => p.id === postId)
        if (post) {
          post.comment_count--
        }
        return true
      }
    } catch (error) {
      console.error('Failed to delete comment:', error)
    }
    return false
  }

  function setFilter(filter: TimelineFilter) {
    activeFilter.value = filter
  }

  return {
    posts,
    currentPost,
    trending,
    isLoading,
    activeFilter,
    fetchPosts,
    fetchPost,
    fetchTrending,
    createPost,
    deletePost,
    addComment,
    deleteComment,
    setFilter,
  }
})
