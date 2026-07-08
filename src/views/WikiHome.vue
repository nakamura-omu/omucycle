<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useWikiStore } from '@/stores/wiki'
import { useUserStore } from '@/stores/user'
import WikiTree from '@/components/wiki/WikiTree.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import EmptyState from '@/components/layout/EmptyState.vue'
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const wikiStore = useWikiStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const showCreate = ref(false)
const newPage = ref({ title: '', slug: '', icon: '' })
const errorMsg = ref('')

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (groupsStore.currentGroup?.id) {
    await wikiStore.fetchTree(groupsStore.currentGroup.id)
  }
}

onMounted(load)
watch(groupSlug, load)

const tree = computed(() => wikiStore.buildTree())

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

async function createPage() {
  errorMsg.value = ''
  if (!groupsStore.currentGroup || !userStore.currentUser?.id) return
  try {
    const created = await wikiStore.createPage({
      group_id: groupsStore.currentGroup.id,
      title: newPage.value.title,
      slug: newPage.value.slug || slugify(newPage.value.title) || `page-${Date.now()}`,
      icon: newPage.value.icon || undefined,
      created_by: userStore.currentUser.id,
    })
    showCreate.value = false
    newPage.value = { title: '', slug: '', icon: '' }
    router.push(`/${groupSlug.value}/wiki/${created.slug}`)
  } catch (e: any) {
    errorMsg.value = e.message || '作成失敗'
  }
}
</script>

<template>
  <div class="flex gap-6 h-[calc(100vh-220px)]">
    <aside class="w-[260px] shrink-0 border-r border-border pr-4 overflow-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold">📖 Wiki</h3>
        <Dialog v-model:open="showCreate">
          <DialogTrigger as-child>
            <Button size="sm" variant="ghost">＋</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しいページ</DialogTitle>
            </DialogHeader>
            <div class="space-y-3 py-2">
              <div>
                <label class="text-sm font-medium">タイトル</label>
                <Input v-model="newPage.title" />
              </div>
              <div>
                <label class="text-sm font-medium">URL slug</label>
                <Input v-model="newPage.slug" />
              </div>
              <div>
                <label class="text-sm font-medium">アイコン</label>
                <Input v-model="newPage.icon" placeholder="📄" />
              </div>
              <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" @click="showCreate = false">キャンセル</Button>
              <Button :disabled="!newPage.title" @click="createPage">作成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <WikiTree :nodes="tree" :group-slug="groupSlug" />
    </aside>

    <div class="flex-1 overflow-auto">
      <EmptyState
        v-if="tree.length === 0"
        message="Wiki ページはまだありません"
      >
        <Button @click="showCreate = true">最初のページを作る</Button>
      </EmptyState>
      <div v-else class="text-muted-foreground py-12 text-center">
        左のツリーからページを選択してください
      </div>
    </div>
  </div>
</template>
