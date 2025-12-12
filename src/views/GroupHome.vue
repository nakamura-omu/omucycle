<script setup lang="ts">
import { onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const groupsStore = useGroupsStore()

// groupIdまたはgroupSlugを取得
const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)

async function loadGroup() {
  if (groupId.value) {
    await groupsStore.fetchGroup(groupId.value)
  } else if (groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
}

onMounted(() => {
  loadGroup()
})

watch([groupId, groupSlug], () => {
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
