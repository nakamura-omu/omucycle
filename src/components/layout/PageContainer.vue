<script setup lang="ts">
const props = withDefaults(defineProps<{
  narrow?: boolean
}>(), { narrow: false })
</script>

<template>
  <div :class="narrow ? 'mx-auto max-w-page-narrow' : 'mx-auto max-w-page'">
    <slot />
  </div>
</template>
