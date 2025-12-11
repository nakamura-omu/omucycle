import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface User {
  id: string
  email: string
  name: string
  auth_type: 'sso' | 'guest'
  created_at: string
  updated_at: string
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const isLoading = ref(false)

  const isLoggedIn = computed(() => currentUser.value !== null)

  async function fetchCurrentUser() {
    // TODO: 認証実装後に実際のユーザー取得に変更
    // 現在はデモユーザーを使用
    isLoading.value = true
    try {
      const res = await fetch('/api/users')
      const users = await res.json()
      if (users.length > 0) {
        currentUser.value = users[0]
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      isLoading.value = false
    }
  }

  function setUser(user: User) {
    currentUser.value = user
  }

  function logout() {
    currentUser.value = null
  }

  return {
    currentUser,
    isLoading,
    isLoggedIn,
    fetchCurrentUser,
    setUser,
    logout,
  }
})
