<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'

export type AtlasTool = 'select' | 'project' | 'section' | 'task' | 'message' | 'link' | 'pen' | 'eraser'

interface ToolDef {
  id: AtlasTool
  icon: string
  label: string
  shortcut?: string
  draggable?: boolean
}

const props = defineProps<{
  modelValue: AtlasTool
  tools: AtlasTool[]
  armedTool?: AtlasTool | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: AtlasTool]
  'tool-drag-start': [value: AtlasTool, startEvent: MouseEvent]
}>()

const ALL_TOOLS: Record<AtlasTool, ToolDef> = {
  select:  { id: 'select',  icon: '🖱️', label: '選択', shortcut: 'V' },
  project: { id: 'project', icon: '📁', label: 'プロジェクト' },
  task:    { id: 'task',    icon: '☐',  label: 'タスク', shortcut: 'T', draggable: true },
  section: { id: 'section', icon: '🗂️', label: 'セクション', shortcut: 'S', draggable: true },
  link:    { id: 'link',    icon: '🔗', label: '繋ぐ', shortcut: 'L' },
  message: { id: 'message', icon: '📝', label: 'メッセージ', shortcut: 'M', draggable: true },
  pen:     { id: 'pen',     icon: '✏️', label: '線を描く', shortcut: 'P' },
  eraser:  { id: 'eraser',  icon: '🗑️', label: '削除', shortcut: 'E' },
}

// グループ分け（kanwas 風）: select + primary + more
const PRIMARY_SET: AtlasTool[] = ['task', 'section', 'link']
const MORE_SET: AtlasTool[] = ['message', 'pen', 'eraser']

const primaryTools = computed(() => props.tools.filter(t => PRIMARY_SET.includes(t)))
const moreTools = computed(() => props.tools.filter(t => MORE_SET.includes(t)))
const hasSelect = computed(() => props.tools.includes('select'))

const isMoreOpen = ref(false)
// もし現在のツールが more 側なら開いておく
watch(() => props.modelValue, (v) => {
  if (MORE_SET.includes(v)) isMoreOpen.value = true
}, { immediate: true })

const DRAG_THRESHOLD = 5

function pick(t: AtlasTool) {
  emit('update:modelValue', t)
}

function onToolMouseDown(e: MouseEvent, t: AtlasTool) {
  if (e.button !== 0) return
  if (!ALL_TOOLS[t].draggable) { pick(t); return }
  const startX = e.clientX, startY = e.clientY
  let dragged = false
  const onMove = (ev: MouseEvent) => {
    if (!dragged && (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD || Math.abs(ev.clientY - startY) > DRAG_THRESHOLD)) {
      dragged = true
      emit('tool-drag-start', t, e)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (!dragged) pick(t)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// More メニューを外側クリックで閉じる
function onWindowClick(e: MouseEvent) {
  if (!isMoreOpen.value) return
  const t = e.target as HTMLElement
  if (t.closest('.atlas-toolbar')) return
  if (MORE_SET.includes(props.modelValue)) return // アクティブなら閉じない
  isMoreOpen.value = false
}
window.addEventListener('mousedown', onWindowClick)
onBeforeUnmount(() => window.removeEventListener('mousedown', onWindowClick))
</script>

<template>
  <div class="atlas-toolbar fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-card border border-border rounded-2xl shadow-lg px-1.5 py-1.5">
    <!-- 選択ツール -->
    <button
      v-if="hasSelect"
      class="atlas-tool-btn w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors relative group"
      :class="[
        props.modelValue === 'select' ? 'bg-info text-info-foreground' : 'hover:bg-muted',
      ]"
      @mousedown="onToolMouseDown($event, 'select')"
    >
      {{ ALL_TOOLS.select.icon }}
      <span class="atlas-tooltip">{{ ALL_TOOLS.select.label }} <span class="opacity-60 ml-1">V</span></span>
    </button>

    <div v-if="hasSelect && primaryTools.length > 0" class="w-px h-6 bg-border mx-1"></div>

    <!-- プライマリツール -->
    <button
      v-for="toolId in primaryTools" :key="toolId"
      class="atlas-tool-btn w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors relative group"
      :class="[
        props.modelValue === toolId ? 'bg-info text-info-foreground' : 'hover:bg-muted',
        props.armedTool === toolId ? 'ring-2 ring-info ring-offset-1' : '',
      ]"
      @mousedown="onToolMouseDown($event, toolId)"
    >
      {{ ALL_TOOLS[toolId].icon }}
      <span class="atlas-tooltip">
        {{ ALL_TOOLS[toolId].label }}
        <span v-if="ALL_TOOLS[toolId].shortcut" class="opacity-60 ml-1">{{ ALL_TOOLS[toolId].shortcut }}</span>
      </span>
    </button>

    <!-- セパレータ + More 展開 -->
    <template v-if="moreTools.length > 0">
      <div class="w-px h-6 bg-border mx-1"></div>
      <div class="relative">
        <button
          class="atlas-tool-btn w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors relative group"
          :class="[
            isMoreOpen ? 'bg-muted' : 'hover:bg-muted',
            MORE_SET.includes(props.modelValue) ? 'text-info' : 'text-muted-foreground',
          ]"
          @click="isMoreOpen = !isMoreOpen"
        >
          <span class="text-sm">{{ isMoreOpen ? '×' : '＋' }}</span>
          <span class="atlas-tooltip">{{ isMoreOpen ? '閉じる' : 'その他のツール' }}</span>
        </button>

        <!-- More ポップオーバー -->
        <div
          v-if="isMoreOpen"
          class="absolute bottom-full mb-2 right-0 bg-card border border-border rounded-xl shadow-lg p-1.5 flex items-center gap-0.5"
        >
          <button
            v-for="toolId in moreTools" :key="toolId"
            class="atlas-tool-btn w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors relative group"
            :class="[
              props.modelValue === toolId ? 'bg-info text-info-foreground' : 'hover:bg-muted',
              props.armedTool === toolId ? 'ring-2 ring-info ring-offset-1' : '',
            ]"
            @mousedown="onToolMouseDown($event, toolId)"
          >
            {{ ALL_TOOLS[toolId].icon }}
            <span class="atlas-tooltip">
              {{ ALL_TOOLS[toolId].label }}
              <span v-if="ALL_TOOLS[toolId].shortcut" class="opacity-60 ml-1">{{ ALL_TOOLS[toolId].shortcut }}</span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.atlas-tool-btn .atlas-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: hsl(var(--foreground) / 0.92);
  color: hsl(var(--background));
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 60;
}
.atlas-tool-btn:hover .atlas-tooltip {
  opacity: 1;
}
</style>
