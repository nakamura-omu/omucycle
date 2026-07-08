<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'

const router = useRouter()
const groupsStore = useGroupsStore()
const userStore = useUserStore()

const showCreateModal = ref(false)
const newGroupName = ref('')

onMounted(() => {
  groupsStore.fetchGroups()
})

function openGroup(group: typeof groupsStore.groups[0]) {
  if (group.slug) {
    router.push(`/${group.slug}`)
  } else {
    router.push(`/groups/${group.id}`)
  }
}

async function createGroup() {
  if (!newGroupName.value.trim() || !userStore.currentUser) return

  try {
    const group = await groupsStore.createGroup(
      newGroupName.value.trim(),
      null,
      userStore.currentUser.id
    )
    showCreateModal.value = false
    newGroupName.value = ''
    router.push(`/groups/${group.id}`)
  } catch (error) {
    console.error('Failed to create group:', error)
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader title="グループ一覧">
      <Button @click="showCreateModal = true">+ グループ作成</Button>
    </PageHeader>

    <div v-if="groupsStore.isLoading" class="text-center text-muted-foreground py-8">
      読み込み中...
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      <Card
        v-for="group in groupsStore.groups"
        :key="group.id"
        class="cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg"
        @click="openGroup(group)"
      >
        <CardContent class="flex items-center gap-4 p-5">
          <span class="text-3xl">📁</span>
          <div class="flex-1">
            <h3 class="text-base font-semibold text-foreground mb-1">{{ group.name }}</h3>
            <div class="flex gap-3 text-xs text-muted-foreground">
              <span>{{ group.member_count }}人</span>
              <span>{{ group.active_tasks }}件進行中</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- グループ作成モーダル -->
    <Dialog v-model:open="showCreateModal">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>新しいグループを作成</DialogTitle>
        </DialogHeader>
        <div class="space-y-2 py-4">
          <Label for="group-name">グループ名</Label>
          <Input
            id="group-name"
            v-model="newGroupName"
            placeholder="例: DX推進課"
            @keyup.enter="createGroup"
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="showCreateModal = false">キャンセル</Button>
          <Button @click="createGroup">作成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageContainer>
</template>
