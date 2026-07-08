<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import AppSidebar from '@/components/AppSidebar.vue'
import TaskDetailPanel from '@/components/task/TaskDetailPanel.vue'
import QuickAddTaskDialog from '@/components/task/QuickAddTaskDialog.vue'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import { useAiChatStore } from '@/stores/aiChat'

const userStore = useUserStore()
const aiStore = useAiChatStore()
const showQuickAdd = ref(false)

onMounted(() => {
  userStore.fetchCurrentUser()
})
</script>

<template>
  <div class="h-screen flex">
    <AppSidebar
      @open-quick-add="showQuickAdd = true"
      @open-ai-chat="aiStore.open()"
    />
    <main class="flex-1 bg-muted/50 overflow-y-auto">
      <div class="p-6">
        <router-view />
      </div>
    </main>
    <TaskDetailPanel />
    <QuickAddTaskDialog v-model="showQuickAdd" />
    <AiChatPanel />
  </div>
</template>
