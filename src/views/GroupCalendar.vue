<script setup lang="ts">
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
</script>

<template>
  <PageContainer>
    <PageHeader title="（仮）改修中" />
    <EmptyState message="Phase 2 で実装します（旧UIは廃止、新スキーマに合わせて再構築中）" />
  </PageContainer>
</template>
