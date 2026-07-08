<script setup lang="ts">
// /my/board は個人プロジェクトのアトラスへリダイレクト
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'

const router = useRouter()

onMounted(async () => {
  const r = await api('/api/users/me/inbox')
  if (r.ok) {
    const data = await r.json()
    router.replace(`/${data.project.group_slug}/atlas/${data.project.slug}`)
  }
})
</script>

<template>
  <div class="text-muted-foreground text-sm p-6">ふせんを開いています…</div>
</template>
