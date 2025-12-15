<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import GroupBasicSettings from '@/components/settings/GroupBasicSettings.vue'
import GroupStatusSettings from '@/components/settings/GroupStatusSettings.vue'
import GroupMemberSettings from '@/components/settings/GroupMemberSettings.vue'

const route = useRoute()
const groupsStore = useGroupsStore()

const groupId = computed(() => route.params.groupId as string | undefined)
const groupSlug = computed(() => route.params.groupSlug as string | undefined)
const resolvedGroupId = computed(() => groupId.value || groupsStore.currentGroup?.id || '')

onMounted(async () => {
  await groupsStore.fetchMembers(resolvedGroupId.value)
})

function handleGroupUpdated(updated: any) {
  groupsStore.currentGroup = updated
}

async function handleMembersChanged() {
  await groupsStore.fetchMembers(resolvedGroupId.value)
}
</script>

<template>
  <div class="settings-page">
    <h2>グループ設定</h2>

    <GroupBasicSettings
      :group="groupsStore.currentGroup"
      :group-slug="groupSlug"
      @updated="handleGroupUpdated"
    />

    <GroupStatusSettings
      :group-id="resolvedGroupId"
    />

    <GroupMemberSettings
      :group-id="resolvedGroupId"
      :members="groupsStore.members"
      @members-changed="handleMembersChanged"
    />
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
}

.settings-page h2 {
  font-size: 1.25rem;
  color: #1a1a2e;
  margin: 0 0 1.5rem 0;
}
</style>
