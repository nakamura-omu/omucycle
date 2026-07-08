<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useGroupsStore } from '@/stores/groups'
import { useUserStore } from '@/stores/user'
import { useTasksStore } from '@/stores/tasks'
import { api } from '@/lib/api'
import { parseTaskInput, type ParsedTask } from '@/lib/parseTaskInput'

const open = defineModel<boolean>()

const groupsStore = useGroupsStore()
const userStore = useUserStore()
const tasksStore = useTasksStore()

interface ProjectOption { id: string; name: string; slug: string; icon: string | null; group_id: string; group_name: string; is_personal: boolean }
const projects = ref<ProjectOption[]>([])
const selectedProjectId = ref<string>('')
const inboxProjectId = ref<string>('')
const assignSelf = ref(true)
const inputText = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const submitting = ref(false)

// 全グループのプロジェクト一覧 + 個人インボックス
async function loadProjects() {
  if (!userStore.currentUser?.id) return

  // インボックス（個人プロジェクト）を確実に取得
  const inboxRes = await api('/api/users/me/inbox')
  let inbox: ProjectOption | null = null
  if (inboxRes.ok) {
    const data = await inboxRes.json()
    inbox = {
      id: data.project.id,
      name: 'インボックス',
      slug: data.project.slug,
      icon: '📥',
      group_id: data.project.group_id,
      group_name: '個人',
      is_personal: true,
    }
    inboxProjectId.value = data.project.id
  }

  if (groupsStore.myGroups.length === 0) {
    await groupsStore.fetchMyGroups(userStore.currentUser.id)
  }
  const all: ProjectOption[] = []
  if (inbox) all.push(inbox)
  for (const g of groupsStore.myGroups) {
    const r = await api(`/api/groups/${g.id}/projects`)
    if (r.ok) {
      const list = await r.json() as any[]
      for (const p of list) {
        if (p.archived || p.is_personal) continue
        all.push({
          id: p.id, name: p.name, slug: p.slug, icon: p.icon ?? null,
          group_id: g.id, group_name: g.name, is_personal: false,
        })
      }
    }
  }
  projects.value = all
  // デフォルトはインボックス
  if (!selectedProjectId.value && inboxProjectId.value) {
    selectedProjectId.value = inboxProjectId.value
  } else if (!selectedProjectId.value && all.length > 0) {
    selectedProjectId.value = all[0]!.id
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await loadProjects()
    inputText.value = ''
    // 開く度にインボックスをデフォルトにリセット
    if (inboxProjectId.value) selectedProjectId.value = inboxProjectId.value
    nextTick(() => inputEl.value?.focus())
  }
})

const parsed = computed<ParsedTask>(() => parseTaskInput(inputText.value))

interface HintMatch { kind: 'project' | 'group' | 'none'; id?: string; label?: string; icon?: string }

const matched = computed<HintMatch>(() => {
  if (!parsed.value.projectHint) return { kind: 'none' }
  const hint = parsed.value.projectHint.toLowerCase()
  const proj = projects.value.find(p =>
    p.slug.toLowerCase() === hint ||
    p.name.toLowerCase().includes(hint)
  )
  if (proj) {
    return {
      kind: 'project',
      id: proj.id,
      icon: proj.icon || '📁',
      label: proj.is_personal ? 'インボックス' : `${proj.group_name} / ${proj.name}`,
    }
  }
  const group = groupsStore.myGroups.find(g =>
    (g.slug || '').toLowerCase() === hint ||
    g.name.toLowerCase().includes(hint)
  )
  if (group) {
    return {
      kind: 'group', id: group.id,
      icon: '📁', label: `${group.name} / 未分類`,
    }
  }
  return { kind: 'none' }
})

// 表示用: マッチ未確定のヒント（緑じゃないチップで）
const unmatchedHint = computed(() =>
  parsed.value.projectHint && matched.value.kind === 'none' ? parsed.value.projectHint : null
)

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '🔴 緊急', important: '🟡 重要', normal: '🔵 通常', none: '優先度なし',
}

async function resolveProjectId(): Promise<string | null> {
  if (matched.value.kind === 'project' && matched.value.id) return matched.value.id
  if (matched.value.kind === 'group' && matched.value.id) {
    // グループの「未分類」プロジェクトを ensure
    const r = await api(`/api/projects/groups/${matched.value.id}/ensure-inbox`, { method: 'POST' })
    if (r.ok) {
      const inbox = await r.json()
      return inbox.id
    }
  }
  return selectedProjectId.value || null
}

async function submit() {
  if (submitting.value) return
  const t = parsed.value
  if (!t.title.trim() || !userStore.currentUser?.id) return
  submitting.value = true
  try {
    const projectId = await resolveProjectId()
    if (!projectId) return
    const payload: any = {
      project_id: projectId,
      title: t.title,
      created_by: userStore.currentUser.id,
    }
    if (t.due_date) payload.due_date = t.due_date
    if (t.priority) payload.priority = t.priority
    if (t.labels && t.labels.length > 0) payload.labels = t.labels
    if (assignSelf.value) {
      payload.assignee_id = userStore.currentUser.id
      payload.assignee_ids = [userStore.currentUser.id]
    }
    await tasksStore.createTask(payload)
    close()
  } finally {
    submitting.value = false
  }
}

function close() {
  open.value = false
}

// 音声入力
const recognition = ref<any>(null)
const isListening = ref(false)
const speechError = ref<string | null>(null)

function getSR(): any {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function setupSpeech() {
  const SR = getSR()
  if (!SR) return false
  const r = new SR()
  r.lang = 'ja-JP'
  r.interimResults = false
  r.continuous = false
  r.onresult = (e: any) => {
    const text = e.results[0][0].transcript
    inputText.value = inputText.value + (inputText.value ? ' ' : '') + text
    speechError.value = null
  }
  r.onend = () => { isListening.value = false }
  r.onerror = (e: any) => {
    isListening.value = false
    speechError.value =
      e.error === 'not-allowed' ? 'マイク権限が拒否されました' :
      e.error === 'no-speech' ? '音声が検出されませんでした' :
      e.error === 'audio-capture' ? 'マイクが利用できません' :
      `エラー: ${e.error}`
  }
  recognition.value = r
  return true
}

function toggleVoice() {
  speechError.value = null
  const SR = getSR()
  if (!SR) {
    speechError.value = 'このブラウザは音声入力に対応していません（Chrome / Edge 推奨）'
    return
  }
  if (!recognition.value) {
    if (!setupSpeech()) return
  }
  if (isListening.value) {
    recognition.value.stop()
    isListening.value = false
  } else {
    try {
      recognition.value.start()
      isListening.value = true
    } catch (e: any) {
      speechError.value = '開始失敗: ' + (e.message || e)
      isListening.value = false
    }
  }
}

// グローバルショートカット: Q キーで開く（フォーカスされてないとき）
function onWindowKey(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') {
    close()
    return
  }
  if (!open.value && (e.key === 'q' || e.key === 'Q')) {
    const tag = (document.activeElement?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable) return
    e.preventDefault()
    open.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))
</script>

<template>
  <Transition name="qa-fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/30" @click.self="close">
      <div class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        <!-- 入力エリア -->
        <div class="p-4">
          <div class="flex items-center gap-2">
            <input
              ref="inputEl"
              v-model="inputText"
              type="text"
              placeholder="タスクを入力（例: 明日 買い物 #個人 !2）"
              class="flex-1 text-base bg-transparent outline-none placeholder:text-muted-foreground"
              @keydown.enter="submit"
              @keydown.esc="close"
            />
            <button
              class="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
              :class="isListening ? 'bg-destructive/20 text-destructive animate-pulse' : 'hover:bg-muted text-muted-foreground'"
              :title="isListening ? '音声入力を停止' : '音声入力を開始'"
              @click="toggleVoice"
            >
              <span v-if="isListening">🎙️</span>
              <span v-else>🎤</span>
            </button>
          </div>

          <div v-if="speechError" class="mt-1 text-xs text-destructive">
            {{ speechError }}
          </div>

          <!-- 解析プレビュー -->
          <div class="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <span v-if="parsed.due_date" class="px-2 py-0.5 rounded bg-info/10 text-info">📅 {{ parsed.due_date }}</span>
            <span v-if="parsed.priority" class="px-2 py-0.5 rounded bg-warning/10 text-warning">{{ PRIORITY_LABEL[parsed.priority] }}</span>
            <span v-if="matched.kind === 'project'" class="px-2 py-0.5 rounded bg-success/10 text-success">{{ matched.icon }} {{ matched.label }}</span>
            <span v-else-if="matched.kind === 'group'" class="px-2 py-0.5 rounded bg-success/10 text-success">{{ matched.icon }} {{ matched.label }}</span>
            <span v-else-if="unmatchedHint" class="px-2 py-0.5 rounded bg-muted text-muted-foreground">未マッチ #{{ unmatchedHint }}</span>
            <span v-for="l in parsed.labels" :key="l" class="px-2 py-0.5 rounded bg-info/10 text-info">@{{ l }}</span>
          </div>
        </div>

        <div class="border-t border-border p-3 flex items-center gap-2 flex-wrap bg-muted/20">
          <select v-model="selectedProjectId" class="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option v-for="p in projects" :key="p.id" :value="p.id">
              <template v-if="p.is_personal">📥 インボックス</template>
              <template v-else>{{ p.icon || '📁' }} {{ p.group_name }} / {{ p.name }}</template>
            </option>
          </select>

          <label class="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" v-model="assignSelf" />
            自分にアサイン
          </label>

          <div class="flex-1"></div>

          <button class="text-xs px-3 py-1.5 hover:bg-muted rounded" @click="close">キャンセル</button>
          <button
            class="text-xs px-3 py-1.5 rounded bg-info text-info-foreground disabled:opacity-50"
            :disabled="!parsed.title.trim() || submitting"
            @click="submit"
          >
            追加 (Enter)
          </button>
        </div>

        <div class="border-t border-border px-4 py-2 text-xs text-muted-foreground bg-muted/10">
          ヒント: 今日 / 明日 / 来週 / 月曜 / 5/20 / !1〜!4 / #プロジェクト / #グループ（未分類へ） / @ラベル
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.qa-fade-enter-active, .qa-fade-leave-active { transition: opacity 0.12s ease; }
.qa-fade-enter-from, .qa-fade-leave-to { opacity: 0; }
</style>
