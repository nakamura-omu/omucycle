<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTasksStore } from '@/stores/tasks'
import { useUserStore } from '@/stores/user'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{ taskId: string }>()

const tasksStore = useTasksStore()
const userStore = useUserStore()

const percent = ref<number | null>(null)
const note = ref('')
const submitting = ref(false)

const logs = computed(() => tasksStore.progressLogs.filter(l => l.task_id === props.taskId))

async function submit() {
  if (!userStore.currentUser?.id) return
  if (percent.value == null && !note.value.trim()) return
  submitting.value = true
  try {
    await tasksStore.addProgressLog(props.taskId, userStore.currentUser.id, {
      progress_percent: percent.value ?? undefined,
      note: note.value.trim() || undefined,
    })
    percent.value = null
    note.value = ''
  } finally {
    submitting.value = false
  }
}

function formatDate(s: string) {
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <label class="text-sm text-muted-foreground">進捗</label>
        <input
          type="range"
          min="0" max="100" step="5"
          :value="percent ?? 0"
          @input="percent = parseInt(($event.target as HTMLInputElement).value)"
          class="flex-1"
        />
        <span class="text-sm w-10 text-right">{{ percent != null ? percent + '%' : '—' }}</span>
        <Button
          v-if="percent != null"
          variant="ghost"
          class="text-xs"
          @click="percent = null"
        >解除</Button>
      </div>
      <Textarea
        v-model="note"
        placeholder="進捗メモ（任意）"
        rows="2"
      />
      <div class="flex justify-end">
        <Button
          :disabled="submitting || (percent == null && !note.trim())"
          @click="submit"
        >進捗を記録</Button>
      </div>
    </div>

    <div v-if="logs.length > 0" class="space-y-2 pt-2 border-t border-border">
      <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">記録</h4>
      <div v-for="log in logs" :key="log.id" class="text-sm flex gap-3 items-start">
        <div class="text-xs text-muted-foreground shrink-0 w-20 pt-0.5">{{ formatDate(log.created_at) }}</div>
        <div class="flex-1">
          <div v-if="log.progress_percent != null" class="flex items-center gap-2 mb-1">
            <div class="h-1.5 bg-muted rounded-full flex-1 overflow-hidden">
              <div class="h-full bg-info" :style="{ width: log.progress_percent + '%' }"></div>
            </div>
            <span class="text-xs">{{ log.progress_percent }}%</span>
          </div>
          <p v-if="log.note" class="text-sm">{{ log.note }}</p>
        </div>
        <span class="text-xs text-muted-foreground shrink-0">{{ log.user_name }}</span>
      </div>
    </div>
  </div>
</template>
