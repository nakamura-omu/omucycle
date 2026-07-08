<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WikiTreeNode } from '@/stores/wiki'

const props = defineProps<{
  nodes: WikiTreeNode[]
  groupSlug: string
  depth?: number
}>()

const route = useRoute()
const router = useRouter()
const depth = computed(() => props.depth ?? 0)

function navigate(slug: string) {
  router.push(`/${props.groupSlug}/wiki/${slug}`)
}

function isCurrent(slug: string) {
  return route.params.pageSlug === slug
}
</script>

<template>
  <div>
    <div v-for="node in nodes" :key="node.id">
      <div
        class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition-colors"
        :class="{ 'bg-info/10 text-info': isCurrent(node.slug) }"
        :style="{ paddingLeft: (depth * 12 + 8) + 'px' }"
        @click="navigate(node.slug)"
      >
        <span v-if="node.icon" class="text-base">{{ node.icon }}</span>
        <span v-else class="text-base text-muted-foreground">📄</span>
        <span class="text-sm flex-1 truncate">{{ node.title }}</span>
      </div>
      <WikiTree
        v-if="node.children.length > 0"
        :nodes="node.children"
        :group-slug="groupSlug"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
