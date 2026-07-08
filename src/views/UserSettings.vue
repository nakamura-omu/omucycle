<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PageContainer from '@/components/layout/PageContainer.vue'
import { api } from '@/lib/api'

const userStore = useUserStore()
const router = useRouter()

const isEditing = ref(false)
const editForm = ref({
  name: '',
  email: '',
})
const isSaving = ref(false)

const userInitial = computed(() => {
  const name = isEditing.value ? editForm.value.name : userStore.currentUser?.name
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
})

const avatarColor = computed(() => {
  const name = isEditing.value ? editForm.value.name : userStore.currentUser?.name
  if (!name) return '#666'
  const colors = ['#4cc9f0', '#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4895ef', '#06d6a0', '#ffd166']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

onMounted(() => {
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
})

function startEdit() {
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  if (userStore.currentUser) {
    editForm.value = {
      name: userStore.currentUser.name,
      email: userStore.currentUser.email,
    }
  }
}

async function saveChanges() {
  if (!userStore.currentUser || !editForm.value.name.trim()) return

  isSaving.value = true
  try {
    const res = await api(`/api/users/${userStore.currentUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.value.name.trim(),
      }),
    })

    if (res.ok) {
      const updated = await res.json()
      userStore.currentUser = updated
      isEditing.value = false
    } else {
      const err = await res.json()
      alert(err.error || '保存に失敗しました')
    }
  } catch (error) {
    console.error('Failed to update user:', error)
    alert('保存に失敗しました')
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  router.back()
}
</script>

<template>
  <PageContainer narrow>
    <div class="mb-6">
      <Button variant="ghost" size="sm" class="mb-2 text-muted-foreground" @click="goBack">
        ← 戻る
      </Button>
      <h1 class="text-2xl font-bold text-foreground">アカウント設定</h1>
    </div>

    <div v-if="userStore.currentUser" class="flex flex-col gap-6">
      <!-- プロフィールセクション -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle class="text-base">プロフィール</CardTitle>
          <Button v-if="!isEditing" variant="secondary" size="sm" @click="startEdit">
            編集
          </Button>
        </CardHeader>
        <CardContent>
          <div class="flex gap-6 items-start">
            <div
              class="w-20 h-20 rounded-full flex items-center justify-center font-semibold text-3xl text-white shrink-0"
              :style="{ background: avatarColor }"
            >
              {{ userInitial }}
            </div>

            <div class="flex-1 flex flex-col gap-4">
              <div class="space-y-1">
                <Label class="text-xs uppercase text-muted-foreground">名前</Label>
                <Input
                  v-if="isEditing"
                  v-model="editForm.name"
                  type="text"
                  placeholder="名前を入力"
                />
                <span v-else class="text-sm text-foreground">{{ userStore.currentUser.name }}</span>
              </div>

              <div class="space-y-1">
                <Label class="text-xs uppercase text-muted-foreground">メールアドレス</Label>
                <span class="text-sm text-muted-foreground">{{ userStore.currentUser.email }}</span>
                <span v-if="isEditing" class="text-xs text-muted-foreground block">メールアドレスは変更できません</span>
              </div>

              <div class="space-y-1">
                <Label class="text-xs uppercase text-muted-foreground">認証タイプ</Label>
                <span class="text-sm text-muted-foreground">
                  {{ userStore.currentUser.auth_type === 'sso' ? 'SSO (Entra ID)' : 'ゲスト' }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="isEditing" class="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="secondary" size="sm" @click="cancelEdit" :disabled="isSaving">
              キャンセル
            </Button>
            <Button size="sm" @click="saveChanges" :disabled="isSaving">
              {{ isSaving ? '保存中...' : '保存' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- アバターカラープレビュー -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">アバタープレビュー</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground mb-4">
            アバターの色は名前から自動生成されます。名前を変更すると色が変わることがあります。
          </p>
          <div class="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div
              class="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-xl text-white"
              :style="{ background: avatarColor }"
            >
              {{ userInitial }}
            </div>
            <span class="text-sm text-foreground">{{ isEditing ? editForm.name : userStore.currentUser.name }}</span>
          </div>
        </CardContent>
      </Card>

      <!-- その他の設定 -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">通知設定</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm italic text-muted-foreground">Coming Soon - 通知設定は今後実装予定です</p>
        </CardContent>
      </Card>
    </div>
  </PageContainer>
</template>
