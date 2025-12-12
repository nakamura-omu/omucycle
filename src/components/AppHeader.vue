<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()

const showUserMenu = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

// ユーザーのイニシャル（アバター用）
const userInitial = computed(() => {
  if (!userStore.currentUser?.name) return '?'
  return userStore.currentUser.name.charAt(0).toUpperCase()
})

// アバターの背景色（名前からハッシュ生成）
const avatarColor = computed(() => {
  if (!userStore.currentUser?.name) return '#666'
  const colors = ['#4cc9f0', '#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4895ef', '#06d6a0', '#ffd166']
  let hash = 0
  for (let i = 0; i < userStore.currentUser.name.length; i++) {
    hash = userStore.currentUser.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

function goHome() {
  router.push('/')
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function goToSettings() {
  showUserMenu.value = false
  router.push('/settings')
}

function logout() {
  showUserMenu.value = false
  // TODO: 実際のログアウト処理
  alert('ログアウト機能は認証実装後に有効になります')
}

// 外側クリックでメニューを閉じる
function handleClickOutside(event: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target as Node)) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="logo" @click="goHome">OmuCycle</h1>
    </div>
    <div class="header-right">
      <template v-if="userStore.currentUser">
        <div ref="userMenuRef" class="user-menu-container">
          <button class="user-avatar-btn" @click="toggleUserMenu">
            <div class="user-avatar" :style="{ background: avatarColor }">
              {{ userInitial }}
            </div>
          </button>

          <div v-if="showUserMenu" class="user-dropdown">
            <div class="dropdown-header">
              <div class="user-avatar-large" :style="{ background: avatarColor }">
                {{ userInitial }}
              </div>
              <div class="user-info">
                <span class="user-name">{{ userStore.currentUser.name }}</span>
                <span class="user-email">{{ userStore.currentUser.email }}</span>
              </div>
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-menu">
              <button class="dropdown-item" @click="goToSettings">
                <span class="item-icon">⚙️</span>
                <span>設定</span>
              </button>
              <button class="dropdown-item" @click="logout">
                <span class="item-icon">🚪</span>
                <span>ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: 56px;
  background: #1a1a2e;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  cursor: pointer;
  color: #4cc9f0;
}

.logo:hover {
  opacity: 0.8;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-menu-container {
  position: relative;
}

.user-avatar-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  transition: transform 0.15s;
}

.user-avatar-btn:hover {
  transform: scale(1.05);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1rem;
  color: white;
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 280px;
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #f8f9fa;
}

.user-avatar-large {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.25rem;
  color: white;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  color: #1a1a2e;
  font-size: 0.9375rem;
}

.user-email {
  font-size: 0.75rem;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-divider {
  height: 1px;
  background: #e0e0e0;
}

.dropdown-menu {
  padding: 0.5rem 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: #333;
  text-align: left;
  transition: background 0.15s;
}

.dropdown-item:hover {
  background: #f0f0f0;
}

.item-icon {
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
}
</style>
