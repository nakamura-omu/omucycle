<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="logo" @click="goHome">OmuCycle</h1>
    </div>
    <div class="header-right">
      <template v-if="userStore.currentUser">
        <span class="user-name">{{ userStore.currentUser.name }}</span>
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

.user-name {
  font-size: 0.875rem;
  color: #ccc;
}
</style>
