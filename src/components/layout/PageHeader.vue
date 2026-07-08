<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-foreground">{{ title }}</h2>
    <div class="flex items-center gap-2">
      <slot />
    </div>
  </div>
</template>
