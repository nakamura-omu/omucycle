<script setup lang="ts">
// インボックスは個人プロジェクトそのもの。実体ページにリダイレクト。
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'

const router = useRouter()

onMounted(async () => {
  const r = await api('/api/users/me/inbox')
  if (r.ok) {
    const data = await r.json()
    router.replace(`/${data.project.group_slug}/${data.project.slug}`)
  }
})
</script>

<template>
  <div class="text-muted-foreground text-sm p-6">インボックスを開いています…</div>
</template>
