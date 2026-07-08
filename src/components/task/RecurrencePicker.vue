<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TaskRecurrence } from '@/stores/tasks'

const props = defineProps<{ taskId: string; initial: TaskRecurrence | null | undefined }>()
const emit = defineEmits<{ updated: [recurrence: TaskRecurrence | null] }>()

type Kind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

const kind = ref<Kind>('none')
const interval = ref(1)
const weekdays = ref<number[]>([1])  // 1=月, 0=日
const dayOfMonth = ref(1)
const monthOfYear = ref(1)

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

watch(() => props.initial, (init) => {
  if (!init) {
    kind.value = 'none'
    return
  }
  kind.value = init.rule_kind as Kind
  try {
    const j = typeof init.rule_json === 'string' ? JSON.parse(init.rule_json) : init.rule_json
    interval.value = j.interval ?? 1
    if (j.weekdays) weekdays.value = j.weekdays
    if (j.day_of_month) dayOfMonth.value = j.day_of_month
    if (j.month_of_year) monthOfYear.value = j.month_of_year
  } catch (e) { console.warn('parse rule_json:', e) }
}, { immediate: true })

const ruleText = computed(() => {
  switch (kind.value) {
    case 'daily':
      return interval.value === 1 ? '毎日' : `${interval.value}日ごと`
    case 'weekly': {
      const wks = weekdays.value.sort().map(w => WEEKDAY_LABELS[w]).join('・')
      return interval.value === 1 ? `毎週${wks}曜日` : `${interval.value}週ごと（${wks}曜日）`
    }
    case 'monthly':
      return interval.value === 1 ? `毎月${dayOfMonth.value}日` : `${interval.value}か月ごと（${dayOfMonth.value}日）`
    case 'yearly':
      return `毎年${monthOfYear.value}月${dayOfMonth.value}日`
    default:
      return '繰り返さない'
  }
})

function toggleWeekday(w: number) {
  if (weekdays.value.includes(w)) {
    weekdays.value = weekdays.value.filter(x => x !== w)
  } else {
    weekdays.value = [...weekdays.value, w].sort()
  }
}

async function save() {
  if (kind.value === 'none') {
    await api(`/api/tasks/${props.taskId}/recurrence`, { method: 'DELETE' })
    emit('updated', null)
    return
  }
  const payload: any = {
    rule_text: ruleText.value,
    rule_kind: kind.value,
    rule_json: { kind: kind.value, interval: interval.value },
  }
  if (kind.value === 'weekly') payload.rule_json.weekdays = weekdays.value
  if (kind.value === 'monthly' || kind.value === 'yearly') payload.rule_json.day_of_month = dayOfMonth.value
  if (kind.value === 'yearly') payload.rule_json.month_of_year = monthOfYear.value

  const res = await api(`/api/tasks/${props.taskId}/recurrence`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.ok) emit('updated', await res.json())
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2">
      <button
        v-for="k in ['none', 'daily', 'weekly', 'monthly', 'yearly'] as Kind[]"
        :key="k"
        class="text-xs px-3 py-1 rounded-full border"
        :class="kind === k ? 'bg-info text-info-foreground border-info' : 'border-input hover:bg-muted'"
        @click="kind = k"
      >
        {{ k === 'none' ? '繰り返さない' : k === 'daily' ? '毎日' : k === 'weekly' ? '毎週' : k === 'monthly' ? '毎月' : '毎年' }}
      </button>
    </div>

    <div v-if="kind !== 'none'" class="space-y-2 pl-2">
      <div v-if="kind === 'daily' || kind === 'weekly' || kind === 'monthly'" class="flex items-center gap-2">
        <label class="text-xs text-muted-foreground">間隔</label>
        <Input
          type="number"
          v-model.number="interval"
          min="1"
          max="99"
          class="w-20"
        />
        <span class="text-xs text-muted-foreground">
          {{ kind === 'daily' ? '日' : kind === 'weekly' ? '週' : 'か月' }}ごと
        </span>
      </div>

      <div v-if="kind === 'weekly'" class="flex gap-1">
        <button
          v-for="(label, w) in WEEKDAY_LABELS"
          :key="w"
          class="w-8 h-8 rounded-full text-xs border"
          :class="weekdays.includes(w) ? 'bg-info text-info-foreground border-info' : 'border-input hover:bg-muted'"
          @click="toggleWeekday(w)"
        >{{ label }}</button>
      </div>

      <div v-if="kind === 'monthly' || kind === 'yearly'" class="flex items-center gap-2">
        <label class="text-xs text-muted-foreground" v-if="kind === 'yearly'">月</label>
        <Input v-if="kind === 'yearly'" type="number" v-model.number="monthOfYear" min="1" max="12" class="w-20" />
        <label class="text-xs text-muted-foreground">日</label>
        <Input type="number" v-model.number="dayOfMonth" min="1" max="31" class="w-20" />
      </div>
    </div>

    <div class="flex items-center justify-between text-xs text-muted-foreground">
      <span>{{ ruleText }}</span>
      <Button size="sm" @click="save">保存</Button>
    </div>
  </div>
</template>
