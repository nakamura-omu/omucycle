<script setup lang="ts">
import PageContainer from '@/components/layout/PageContainer.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
</script>

<template>
  <PageContainer narrow>
    <h1 class="text-2xl font-bold flex items-center gap-2 mb-1">
      <span>🏷️</span>
      <span>フィルター &amp; ラベル</span>
    </h1>
    <EmptyState message="近日対応です。優先度別、ラベル別、期限別の保存可能なフィルタを実装予定" />
  </PageContainer>
</template>
