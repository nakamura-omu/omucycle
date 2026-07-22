<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <Transition
    enter-active-class="transition duration-150"
    enter-from-class="opacity-0 translate-y-2"
    leave-active-class="transition duration-150"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="toast.current"
      class="fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-lg bg-foreground text-background text-sm px-4 py-3 shadow-lg"
    >
      <span>{{ toast.current.message }}</span>
      <button
        v-if="toast.current.actionLabel"
        class="font-semibold text-warning hover:underline shrink-0"
        @click="toast.runAction()"
      >{{ toast.current.actionLabel }}</button>
      <button
        class="text-background/60 hover:text-background shrink-0"
        title="閉じる"
        @click="toast.dismiss()"
      >✕</button>
    </div>
  </Transition>
</template>
