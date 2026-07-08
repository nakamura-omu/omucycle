<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAiChatStore } from '@/stores/aiChat'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const aiStore = useAiChatStore()
const route = useRoute()

interface ToolCall { id: string; name: string; input?: any; result?: any; running: boolean }
interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

const turns = ref<ChatTurn[]>([])
const inputText = ref('')
const sending = ref(false)
const scrollEl = ref<HTMLDivElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

const placeholder = computed(() => {
  return turns.value.length === 0
    ? '何を相談しますか？例: 議事録を貼ってタスク化 / 今週のやることをまとめて / DX推進課の進捗は？'
    : 'メッセージを入力'
})

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

async function send() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  sending.value = true
  inputText.value = ''

  turns.value.push({ role: 'user', text })
  const assistant: ChatTurn = { role: 'assistant', text: '', toolCalls: [], isStreaming: true }
  turns.value.push(assistant)
  scrollToBottom()

  // 履歴を Anthropic 形式に変換（過去のユーザー/アシスタント発話だけ）
  const messages: any[] = []
  for (const t of turns.value.slice(0, -1)) {
    if (t.role === 'user') {
      messages.push({ role: 'user', content: t.text })
    } else if (t.role === 'assistant' && t.text) {
      messages.push({ role: 'assistant', content: t.text })
    }
  }

  const context = {
    path: route.path,
    params: route.params,
  }

  try {
    const res = await fetch(`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    })
    if (!res.ok || !res.body) {
      assistant.text += `\n[エラー: ${res.status}]`
      assistant.isStreaming = false
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleSseEvent(chunk, assistant)
        scrollToBottom()
      }
    }
  } catch (e: any) {
    assistant.text += `\n[通信エラー: ${e?.message || e}]`
  } finally {
    assistant.isStreaming = false
    sending.value = false
    scrollToBottom()
  }
}

function handleSseEvent(chunk: string, assistant: ChatTurn) {
  let event = 'message'
  let data = ''
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return
  let payload: any
  try { payload = JSON.parse(data) } catch { return }

  if (event === 'text_delta') {
    assistant.text += payload.text
  } else if (event === 'tool_start') {
    assistant.toolCalls = assistant.toolCalls || []
    assistant.toolCalls.push({ id: payload.id, name: payload.name, running: true })
  } else if (event === 'tool_run') {
    const tc = assistant.toolCalls?.find(t => t.id === payload.id)
    if (tc) tc.input = payload.input
  } else if (event === 'tool_result') {
    const tc = assistant.toolCalls?.find(t => t.id === payload.id)
    if (tc) {
      tc.result = payload.result
      tc.running = false
    }
  } else if (event === 'done') {
    assistant.isStreaming = false
  } else if (event === 'error') {
    assistant.text += `\n[エラー: ${payload.message}]`
    assistant.isStreaming = false
  }
}

function onWindowKey(e: KeyboardEvent) {
  if (aiStore.isOpen && e.key === 'Escape') aiStore.close()
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))

watch(() => aiStore.isOpen, (v) => {
  if (v) nextTick(() => inputEl.value?.focus())
})

function newChat() {
  turns.value = []
  inputText.value = ''
  nextTick(() => inputEl.value?.focus())
}

function summarize(input: any): string {
  if (!input) return ''
  const s = JSON.stringify(input)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
</script>

<template>
  <Transition name="ai-panel">
    <div v-if="aiStore.isOpen" class="fixed inset-0 z-40 pointer-events-none">
      <div class="absolute inset-0 bg-black/10 pointer-events-auto" @click="aiStore.close()"></div>
      <aside
        class="ai-panel absolute top-0 right-0 bottom-0 w-full sm:w-[480px] lg:w-[560px] bg-card shadow-2xl border-l border-border pointer-events-auto flex flex-col"
      >
        <header class="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span class="text-base">🤖</span>
          <h2 class="text-base font-bold flex-1">AI に相談</h2>
          <button class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted" @click="newChat">新規</button>
          <button class="text-base text-muted-foreground hover:text-foreground" @click="aiStore.close()" title="閉じる (Esc)">✕</button>
        </header>

        <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div v-if="turns.length === 0" class="text-sm text-muted-foreground py-12 text-center space-y-2">
            <p class="text-base">何を相談しますか？</p>
            <ul class="text-xs space-y-1 mt-3 inline-block text-left">
              <li>📝 議事録を貼って → タスク化</li>
              <li>📅 「今週やるべきことを整理して」</li>
              <li>📊 「DX推進課の進捗は？」</li>
              <li>✅ 「タスクXを完了して」</li>
              <li>🔀 「タスクYをサブタスクに分解して」</li>
            </ul>
          </div>

          <div v-for="(turn, i) in turns" :key="i" class="space-y-2">
            <!-- ユーザー -->
            <div v-if="turn.role === 'user'" class="flex justify-end">
              <div class="bg-info/15 text-foreground rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap text-sm">
                {{ turn.text }}
              </div>
            </div>

            <!-- アシスタント -->
            <div v-else class="space-y-2">
              <!-- ツール呼び出し -->
              <div v-if="turn.toolCalls && turn.toolCalls.length > 0" class="space-y-1">
                <div
                  v-for="tc in turn.toolCalls"
                  :key="tc.id"
                  class="text-xs flex items-start gap-2 px-2 py-1 rounded bg-muted/40"
                >
                  <span class="shrink-0 mt-0.5">{{ tc.running ? '⏳' : '✅' }}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-muted-foreground">{{ tc.name }}</div>
                    <div v-if="tc.input" class="font-mono text-muted-foreground/70 truncate">{{ summarize(tc.input) }}</div>
                  </div>
                </div>
              </div>

              <!-- テキスト -->
              <div v-if="turn.text || turn.isStreaming" class="text-sm whitespace-pre-wrap leading-relaxed">
                {{ turn.text }}
                <span v-if="turn.isStreaming" class="inline-block w-2 h-4 bg-info/50 align-middle animate-pulse ml-0.5"></span>
              </div>
            </div>
          </div>
        </div>

        <footer class="border-t border-border p-3">
          <div class="flex items-end gap-2">
            <Textarea
              ref="inputEl"
              v-model="inputText"
              :placeholder="placeholder"
              rows="2"
              class="resize-none text-sm"
              @keydown.enter.exact.prevent="send"
            />
            <Button :disabled="!inputText.trim() || sending" @click="send">
              {{ sending ? '...' : '送信' }}
            </Button>
          </div>
          <div class="text-xs text-muted-foreground mt-1.5">
            Enter で送信 / Shift+Enter で改行 / Esc で閉じる
          </div>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.ai-panel-enter-active, .ai-panel-leave-active { transition: opacity 0.15s ease; }
.ai-panel-enter-active .ai-panel, .ai-panel-leave-active .ai-panel { transition: transform 0.2s ease-out; }
.ai-panel-enter-from, .ai-panel-leave-to { opacity: 0; }
.ai-panel-enter-from .ai-panel, .ai-panel-leave-to .ai-panel { transform: translateX(100%); }
</style>
