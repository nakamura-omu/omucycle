<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const userStore = useUserStore()
const router = useRouter()

const userInitial = computed(() => {
  if (!userStore.currentUser?.name) return '?'
  return userStore.currentUser.name.charAt(0).toUpperCase()
})

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

function goToSettings() {
  router.push('/settings')
}

function logout() {
  alert('ログアウト機能は認証実装後に有効になります')
}
</script>

<template>
  <header class="h-14 bg-sidebar text-white flex items-center justify-between px-6 shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
    <div class="flex items-center gap-4">
      <h1 class="text-xl font-bold m-0 cursor-pointer text-primary hover:opacity-80 transition-opacity" @click="goHome">OmuCycle</h1>
    </div>
    <div class="flex items-center gap-4">
      <template v-if="userStore.currentUser">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button class="border-0 cursor-pointer p-0 rounded-full bg-transparent hover:scale-105 transition-transform">
              <Avatar size="sm" shape="circle">
                <AvatarFallback class="text-white font-semibold text-base" :style="{ background: avatarColor }">
                  {{ userInitial }}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-[280px]" align="end">
            <DropdownMenuLabel class="p-3">
              <div class="flex items-center gap-3">
                <Avatar size="sm" shape="circle" class="shrink-0 h-12 w-12">
                  <AvatarFallback class="text-white font-semibold text-xl" :style="{ background: avatarColor }">
                    {{ userInitial }}
                  </AvatarFallback>
                </Avatar>
                <div class="flex flex-col min-w-0">
                  <span class="font-semibold text-sm text-foreground">{{ userStore.currentUser.name }}</span>
                  <span class="text-xs text-muted-foreground truncate">{{ userStore.currentUser.email }}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="cursor-pointer gap-3 px-3 py-2.5" @click="goToSettings">
              <span class="text-base w-5 text-center">⚙️</span>
              <span>設定</span>
            </DropdownMenuItem>
            <DropdownMenuItem class="cursor-pointer gap-3 px-3 py-2.5" @click="logout">
              <span class="text-base w-5 text-center">🚪</span>
              <span>ログアウト</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </div>
  </header>
</template>
