import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

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
    isLoading.value = true
    try {
      const res = await api('/api/me')
      if (res.ok) {
        currentUser.value = await res.json()
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
