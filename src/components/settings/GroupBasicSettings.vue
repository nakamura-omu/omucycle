<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

const props = defineProps<{
  group: {
    id: string
    name: string
    slug: string | null
  } | null
  groupSlug: string | undefined
}>()

const emit = defineEmits<{
  updated: [group: any]
}>()

const router = useRouter()
const origin = computed(() => typeof window !== 'undefined' ? window.location.origin : '')

const groupSettings = ref({
  name: '',
  slug: '',
})
const isEditing = ref(false)
const slugError = ref('')

watch(() => props.group, () => {
  loadSettings()
}, { immediate: true })

function loadSettings() {
  if (props.group) {
    groupSettings.value = {
      name: props.group.name,
      slug: props.group.slug || '',
    }
  }
}

function validateSlug(slug: string): boolean {
  if (!slug) return true
  const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
  return pattern.test(slug)
}

async function saveSettings() {
  if (!validateSlug(groupSettings.value.slug)) {
    slugError.value = '英小文字、数字、ハイフンのみ使用可能です（例: dx-suishin）'
    return
  }
  slugError.value = ''

  try {
    const res = await api(`/api/groups/${props.group?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupSettings.value.name,
        slug: groupSettings.value.slug || null,
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      emit('updated', updated)
      isEditing.value = false

      if (updated.slug && updated.slug !== props.groupSlug) {
        router.replace(`/${updated.slug}/settings`)
      }
    } else {
      const err = await res.json()
      if (err.error?.includes('UNIQUE constraint')) {
        slugError.value = 'このスラッグは既に使用されています'
      } else {
        alert(err.error || '保存に失敗しました')
      }
    }
  } catch (error) {
    console.error('Failed to save group settings:', error)
  }
}

function cancelEdit() {
  isEditing.value = false
  loadSettings()
}
</script>

<template>
  <Card class="mb-6">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <CardTitle class="text-base">基本設定</CardTitle>
      <div class="flex gap-2">
        <Button
          v-if="!isEditing"
          variant="secondary"
          size="sm"
          @click="isEditing = true"
        >
          編集
        </Button>
        <template v-else>
          <Button variant="secondary" size="sm" @click="cancelEdit">
            キャンセル
          </Button>
          <Button size="sm" @click="saveSettings">
            保存
          </Button>
        </template>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="space-y-1.5">
        <Label>グループ名</Label>
        <Input
          v-if="isEditing"
          v-model="groupSettings.name"
          placeholder="グループ名"
        />
        <span v-else class="text-sm text-foreground">{{ group?.name }}</span>
      </div>

      <div class="space-y-1.5">
        <Label>URL スラッグ</Label>
        <div v-if="isEditing" class="flex items-center">
          <span class="text-sm text-muted-foreground bg-muted px-2 py-2 border border-r-0 border-input rounded-l-md">
            {{ origin }}/
          </span>
          <Input
            v-model="groupSettings.slug"
            placeholder="dx-suishin"
            class="rounded-l-none"
          />
        </div>
        <span v-else class="text-sm text-foreground">
          <template v-if="group?.slug">
            {{ origin }}/{{ group.slug }}
          </template>
          <template v-else>
            <span class="italic text-muted-foreground">未設定</span>
          </template>
        </span>
        <p v-if="slugError" class="text-xs text-destructive mt-1">{{ slugError }}</p>
        <p class="text-xs text-muted-foreground mt-1">英小文字、数字、ハイフンが使えます（例: dx-suishin）</p>
      </div>
    </CardContent>
  </Card>
</template>
