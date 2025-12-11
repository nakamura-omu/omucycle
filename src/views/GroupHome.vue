<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const groupsStore = useGroupsStore()

async function loadGroup() {
  const groupId = route.params.groupId as string
  if (groupId) {
    await groupsStore.fetchGroup(groupId)
  }
}

onMounted(() => {
  loadGroup()
})

watch(() => route.params.groupId, () => {
  loadGroup()
})
</script>

<template>
  <div class="group-home">
    <div v-if="groupsStore.currentGroup" class="group-header">
      <h1>{{ groupsStore.currentGroup.name }}</h1>
    </div>
    <router-view />
  </div>
</template>

<style scoped>
.group-home {
  max-width: 1200px;
  margin: 0 auto;
}

.group-header {
  margin-bottom: 1.5rem;
}

.group-header h1 {
  font-size: 1.5rem;
  color: #1a1a2e;
  margin: 0;
}
</style>
