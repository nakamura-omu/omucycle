<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center text-muted-foreground py-12 gap-3">
    <p class="text-sm">{{ message }}</p>
    <slot />
  </div>
</template>
