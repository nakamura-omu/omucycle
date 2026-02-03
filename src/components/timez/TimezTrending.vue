<script setup lang="ts">
import type { TrendingHashtag } from '@/stores/timez'

defineProps<{
  trending: TrendingHashtag[]
}>()

const emit = defineEmits<{
  'hashtag-click': [hashtag: string]
}>()
</script>

<template>
  <div class="trending-section">
    <h3>トレンド</h3>
    <div v-if="trending.length === 0" class="empty">
      トレンドはありません
    </div>
    <div v-else class="trending-list">
      <div
        v-for="item in trending"
        :key="item.hashtag"
        class="trending-item"
        @click="$emit('hashtag-click', item.hashtag)"
      >
        <span class="hashtag">#{{ item.hashtag }}</span>
        <span class="count">{{ item.count }}件</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trending-section {
  background: white;
  border-radius: 8px;
  padding: 1rem;
}

h3 {
  font-size: 0.9375rem;
  color: #1a1a2e;
  margin: 0 0 0.75rem 0;
}

.empty {
  color: #999;
  font-size: 0.875rem;
}

.trending-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.trending-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.trending-item:hover {
  background: #f0f0f0;
}

.hashtag {
  color: #4338ca;
  font-weight: 500;
}

.count {
  font-size: 0.75rem;
  color: #999;
}
</style>
