<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import { useWikiStore } from '@/stores/wiki'
import { useUserStore } from '@/stores/user'
import WikiTree from '@/components/wiki/WikiTree.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const wikiStore = useWikiStore()
const userStore = useUserStore()

const groupSlug = computed(() => route.params.groupSlug as string)
const pageSlug = computed(() => route.params.pageSlug as string)

const titleEdit = ref('')
const contentEdit = ref('')
const isEditing = ref(false)

async function load() {
  if (!groupsStore.currentGroup || groupsStore.currentGroup.slug !== groupSlug.value) {
    await groupsStore.fetchGroupBySlug(groupSlug.value)
  }
  if (!groupsStore.currentGroup?.id) return
  await wikiStore.fetchTree(groupsStore.currentGroup.id)
  await wikiStore.fetchBySlug(groupsStore.currentGroup.id, pageSlug.value)
  titleEdit.value = wikiStore.currentPage?.title || ''
  contentEdit.value = wikiStore.currentPage?.content || ''
  isEditing.value = false
}

onMounted(load)
watch([groupSlug, pageSlug], load)

const page = computed(() => wikiStore.currentPage)
const tree = computed(() => wikiStore.buildTree())

async function save() {
  if (!page.value) return
  await wikiStore.updatePage(page.value.id, {
    title: titleEdit.value,
    content: contentEdit.value,
    updated_by: userStore.currentUser?.id,
  } as any)
  isEditing.value = false
}

async function deletePage() {
  if (!page.value || !confirm('このページを削除しますか？')) return
  await wikiStore.deletePage(page.value.id)
  router.push(`/${groupSlug.value}/wiki`)
}

function renderMarkdown(md: string) {
  // ごく軽量な Markdown 風処理（ヘッダ、リスト、コード、リンク）
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n')
  const out: string[] = []
  let inCode = false
  let inList = false
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) { out.push('</pre>'); inCode = false }
      else { out.push('<pre class="bg-muted p-3 rounded text-xs overflow-auto">'); inCode = true }
      continue
    }
    if (inCode) { out.push(escape(line)); continue }
    if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h1 class="text-2xl font-bold mt-6 mb-3">${escape(line.slice(2))}</h1>`)
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2 class="text-xl font-bold mt-5 mb-2">${escape(line.slice(3))}</h2>`)
    } else if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h3 class="text-lg font-semibold mt-4 mb-2">${escape(line.slice(4))}</h3>`)
    } else if (line.match(/^[-*] /)) {
      if (!inList) { out.push('<ul class="list-disc pl-6 my-2">'); inList = true }
      out.push(`<li>${escape(line.replace(/^[-*] /, ''))}</li>`)
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('<br/>')
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      // インラインリンク [text](url)
      const html = escape(line).replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" class="text-info underline">$1</a>')
      out.push(`<p class="my-1">${html}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  if (inCode) out.push('</pre>')
  return out.join('\n')
}
</script>

<template>
  <div class="flex gap-6 h-[calc(100vh-220px)]">
    <aside class="w-[260px] shrink-0 border-r border-border pr-4 overflow-auto">
      <h3 class="text-sm font-semibold mb-3">📖 Wiki</h3>
      <WikiTree :nodes="tree" :group-slug="groupSlug" />
    </aside>

    <div class="flex-1 overflow-auto">
      <div v-if="!page" class="text-muted-foreground py-12 text-center">読み込み中…</div>
      <div v-else class="space-y-4">
        <div class="flex items-center justify-between">
          <Input
            v-if="isEditing"
            v-model="titleEdit"
            class="text-2xl !h-auto !py-1.5 !font-bold"
          />
          <h1 v-else class="text-2xl font-bold">
            <span v-if="page.icon">{{ page.icon }} </span>{{ page.title }}
          </h1>
          <div class="flex items-center gap-2">
            <Button v-if="!isEditing" variant="ghost" @click="isEditing = true">編集</Button>
            <template v-else>
              <Button variant="ghost" @click="isEditing = false">キャンセル</Button>
              <Button @click="save">保存</Button>
            </template>
            <Button v-if="!isEditing" variant="ghost" class="text-destructive" @click="deletePage">削除</Button>
          </div>
        </div>

        <Textarea
          v-if="isEditing"
          v-model="contentEdit"
          rows="20"
          class="font-mono text-sm"
          placeholder="# 見出し&#10;&#10;Markdown が使えます"
        />
        <article
          v-else
          class="text-sm leading-relaxed"
          v-html="renderMarkdown(page.content || '')"
        />

        <div v-if="!isEditing" class="text-xs text-muted-foreground border-t border-border pt-2">
          最終更新: {{ page.updated_at }}<span v-if="page.updated_by_name"> by {{ page.updated_by_name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
