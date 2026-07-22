<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import GroupBasicSettings from '@/components/settings/GroupBasicSettings.vue'
import GroupDirectoryLink from '@/components/settings/GroupDirectoryLink.vue'
import GroupMemberSettings from '@/components/settings/GroupMemberSettings.vue'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'

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

// 連携の設定/解除/同期後: グループ本体（連携フィールド）とメンバー両方を取り直す
async function handleLinkChanged() {
  await Promise.all([
    groupsStore.fetchGroup(resolvedGroupId.value),
    groupsStore.fetchMembers(resolvedGroupId.value),
  ])
}
</script>

<template>
  <PageContainer narrow>
    <PageHeader title="グループ設定" />

    <GroupBasicSettings
      :group="groupsStore.currentGroup"
      :group-slug="groupSlug"
      @updated="handleGroupUpdated"
    />

    <GroupDirectoryLink
      :group-id="resolvedGroupId"
      :group="groupsStore.currentGroup"
      @link-changed="handleLinkChanged"
    />

    <GroupMemberSettings
      :group-id="resolvedGroupId"
      :members="groupsStore.members"
      @members-changed="handleMembersChanged"
    />
  </PageContainer>
</template>
