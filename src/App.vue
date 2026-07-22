<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import AppSidebar from '@/components/AppSidebar.vue'
import TaskDetailPanel from '@/components/task/TaskDetailPanel.vue'
import QuickAddTaskDialog from '@/components/task/QuickAddTaskDialog.vue'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import UndoToast from '@/components/UndoToast.vue'
import { useAiChatStore } from '@/stores/aiChat'

const route = useRoute()
const userStore = useUserStore()
const aiStore = useAiChatStore()
const showQuickAdd = ref(false)

// サイドバー開閉+幅（Todoist流: ☰で引っ込む、境界をつまんでリサイズ。localStorageに記憶）
const sidebarOpen = ref(localStorage.getItem('cycle.sidebarOpen') !== '0')
const sidebarWidth = ref(Math.min(420, Math.max(200, Number(localStorage.getItem('cycle.sidebarWidth')) || 240)))
const isMobile = ref(false)
const mq = window.matchMedia('(max-width: 768px)')

function onMqChange() {
  isMobile.value = mq.matches
  if (mq.matches) sidebarOpen.value = false
}

watch(sidebarOpen, (v) => {
  if (!isMobile.value) localStorage.setItem('cycle.sidebarOpen', v ? '1' : '0')
})
// モバイルではメニュー選択後に自動で閉じる（Todoistと同じ）
watch(() => route.fullPath, () => {
  if (isMobile.value) sidebarOpen.value = false
})

function startResize(e: PointerEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = sidebarWidth.value
  const move = (ev: PointerEvent) => {
    sidebarWidth.value = Math.min(420, Math.max(200, startW + ev.clientX - startX))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    localStorage.setItem('cycle.sidebarWidth', String(sidebarWidth.value))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// OMU365共通シェル（ワッフル・サービスカラー・右上の自分）。
// nginx配下でのみ配信されるため動的ロードし、vite直アクセスの開発時は黙ってスキップ
function mountOmuShell() {
  const init = () => (window as any).OmuShell?.init({ service: 'cycle' })
  if ((window as any).OmuShell) return init()
  const s = document.createElement('script')
  s.src = '/shell/omu-shell.js'
  s.onload = init
  s.onerror = () => {} // 開発環境(シェル不在)では素のまま動く
  document.head.appendChild(s)
}

// M でサイドバー開閉（Todoistと同じ。入力中は無視 — Qショートカットと同じガード）
function onWindowKey(e: KeyboardEvent) {
  if (e.key !== 'm' && e.key !== 'M') return
  const tag = (document.activeElement?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable) return
  e.preventDefault()
  sidebarOpen.value = !sidebarOpen.value
}

onMounted(() => {
  userStore.fetchCurrentUser()
  mountOmuShell()
  onMqChange()
  mq.addEventListener('change', onMqChange)
  window.addEventListener('keydown', onWindowKey)
})
onUnmounted(() => {
  mq.removeEventListener('change', onMqChange)
  window.removeEventListener('keydown', onWindowKey)
})
</script>

<template>
  <div class="h-screen flex flex-col">
    <header id="omu-header"></header>
    <div class="flex flex-1 min-h-0 relative">
      <!-- モバイル時のバックドロップ -->
      <div
        v-if="sidebarOpen && isMobile"
        class="fixed inset-0 bg-foreground/30 z-30"
        @click="sidebarOpen = false"
      ></div>

      <div
        v-show="sidebarOpen"
        class="shrink-0 h-full z-40"
        :class="isMobile ? 'fixed inset-y-0 left-0 shadow-xl' : 'relative'"
        :style="{ width: sidebarWidth + 'px' }"
      >
        <AppSidebar
          @open-quick-add="showQuickAdd = true"
          @open-ai-chat="aiStore.open()"
          @close="sidebarOpen = false"
        />
      </div>

      <!-- リサイズハンドル（デスクトップのみ。つまんで幅変更） -->
      <div
        v-if="sidebarOpen && !isMobile"
        class="w-1 -ml-0.5 shrink-0 cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60 transition-colors"
        title="ドラッグで幅を変更"
        @pointerdown="startResize"
      ></div>

      <!-- サイドバーが閉じているときの開くボタン -->
      <button
        v-if="!sidebarOpen"
        class="absolute top-2.5 left-2.5 z-30 w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        title="メニューを開く (M)"
        @click="sidebarOpen = true"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <main class="flex-1 bg-muted/50 overflow-y-auto min-w-0">
        <div class="p-6" :class="{ 'pt-12': !sidebarOpen }">
          <router-view />
        </div>
      </main>
    </div>
    <TaskDetailPanel />
    <QuickAddTaskDialog v-model="showQuickAdd" />
    <AiChatPanel />
    <UndoToast />
  </div>
</template>
