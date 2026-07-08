<script setup lang="ts">
import { onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'

const route = useRoute()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()

const groupSlug = computed(() => route.params.groupSlug as string)

async function loadGroup() {
  if (groupSlug.value && (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value)) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (groupsStore.currentGroup?.id) {
    await projectsStore.fetchGroupProjects(groupsStore.currentGroup.id)
  }
}

onMounted(loadGroup)
watch(groupSlug, loadGroup)
</script>

<template>
  <div class="mx-auto max-w-[1280px]">
    <router-view />
  </div>
</template>
