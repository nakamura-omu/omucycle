<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// omuidがあればDirectory経由の顔写真（Entraのprofile photo）、
// 取れなければ名前イニシャル+ハッシュ色にフォールバック。
// 開発環境(vite直)では/directory/が無いので常にイニシャルになる
const props = defineProps<{
  name?: string | null
  omuid?: string | null
  size?: 'sm' | 'md' | 'lg'
}>()

const imgFailed = ref(false)
watch(() => props.omuid, () => { imgFailed.value = false })

const showPhoto = computed(() => !!props.omuid && !imgFailed.value)
const photoUrl = computed(() => `/directory/api/me/users/${props.omuid}/photo`)

const sizeClass = computed(() => ({
  sm: 'w-6 h-6 text-xs',
  md: 'w-7 h-7 text-sm',
  lg: 'w-12 h-12 text-xl',
}[props.size ?? 'md']))

const initial = computed(() => props.name?.charAt(0)?.toUpperCase() ?? '?')

const bgColor = computed(() => {
  if (!props.name) return '#9ca3af'
  const colors = ['#dc4c3e', '#eb8909', '#299438', '#246fe0', '#8f4fd1', '#0e8c94', '#b8256f', '#666666']
  let hash = 0
  for (let i = 0; i < props.name.length; i++) {
    hash = props.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})
</script>

<template>
  <img
    v-if="showPhoto"
    :src="photoUrl"
    :alt="name ?? ''"
    class="rounded-full object-cover shrink-0"
    :class="sizeClass"
    @error="imgFailed = true"
  />
  <span
    v-else
    class="rounded-full flex items-center justify-center font-semibold shrink-0 text-white"
    :class="sizeClass"
    :style="{ background: bgColor }"
  >{{ initial }}</span>
</template>
