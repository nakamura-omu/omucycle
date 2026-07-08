<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useProjectsStore } from '@/stores/projects'
import { useUserStore } from '@/stores/user'
import PageContainer from '@/components/layout/PageContainer.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const projectsStore = useProjectsStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const groupId = computed(() => groupsStore.currentGroup?.id || '')

const showCreateDialog = ref(false)
const newProject = ref({ name: '', slug: '', prefix: '', icon: '', description: '' })
const errorMsg = ref('')

async function load() {
  if (!groupsStore.currentGroup) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (groupId.value) {
    await projectsStore.fetchGroupProjects(groupId.value)
  }
}

onMounted(load)
watch(groupSlug, load)

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function autoSlug() {
  if (!newProject.value.slug && newProject.value.name) {
    newProject.value.slug = slugify(newProject.value.name)
  }
}

async function createProject() {
  errorMsg.value = ''
  if (!userStore.currentUser?.id) return
  try {
    const created = await projectsStore.createProject({
      group_id: groupId.value,
      name: newProject.value.name,
      slug: newProject.value.slug || slugify(newProject.value.name),
      prefix: newProject.value.prefix || null,
      icon: newProject.value.icon || null,
      description: newProject.value.description || null,
      created_by: userStore.currentUser.id,
    })
    showCreateDialog.value = false
    newProject.value = { name: '', slug: '', prefix: '', icon: '', description: '' }
    router.push(`/${groupSlug.value}/${created.slug}`)
  } catch (e: any) {
    errorMsg.value = e.message || '作成に失敗しました'
  }
}

function projectPath(slug: string) {
  return `/${groupSlug.value}/${slug}`
}
</script>

<template>
  <PageContainer>
    <PageHeader title="プロジェクト">
      <Dialog v-model:open="showCreateDialog">
          <DialogTrigger as-child>
            <Button>＋ 新しいプロジェクト</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しいプロジェクト</DialogTitle>
              <DialogDescription>
                プロジェクトを作成すると、デフォルトの付箋ボードも一緒に作成されます。
              </DialogDescription>
            </DialogHeader>
            <div class="space-y-4 py-2">
              <div>
                <label class="text-sm font-medium">名前</label>
                <Input v-model="newProject.name" @blur="autoSlug" placeholder="例: 入学式準備" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-sm font-medium">URL slug</label>
                  <Input v-model="newProject.slug" placeholder="admission-ceremony" />
                </div>
                <div>
                  <label class="text-sm font-medium">タスク接頭辞</label>
                  <Input v-model="newProject.prefix" placeholder="ADM" />
                </div>
              </div>
              <div>
                <label class="text-sm font-medium">アイコン (絵文字)</label>
                <Input v-model="newProject.icon" placeholder="🎓" />
              </div>
              <div>
                <label class="text-sm font-medium">説明</label>
                <Input v-model="newProject.description" placeholder="任意" />
              </div>
              <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" @click="showCreateDialog = false">キャンセル</Button>
              <Button :disabled="!newProject.name" @click="createProject">作成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </PageHeader>

    <EmptyState v-if="!projectsStore.isLoading && projectsStore.projects.length === 0"
                message="まだプロジェクトがありません">
      <Button @click="showCreateDialog = true">最初のプロジェクトを作る</Button>
    </EmptyState>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card
        v-for="p in projectsStore.projects"
        :key="p.id"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push(projectPath(p.slug))"
      >
        <CardContent class="p-4 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">{{ p.icon || '📁' }}</span>
            <h3 class="text-base font-semibold flex-1 truncate">{{ p.name }}</h3>
            <span v-if="p.prefix" class="text-xs text-muted-foreground">{{ p.prefix }}</span>
          </div>
          <p v-if="p.description" class="text-xs text-muted-foreground line-clamp-2">{{ p.description }}</p>
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{{ p.active_tasks || 0 }} 進行中</span>
            <span>/ {{ p.total_tasks || 0 }} 全タスク</span>
          </div>
        </CardContent>
      </Card>
    </div>
  </PageContainer>
</template>
