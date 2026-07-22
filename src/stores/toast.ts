import { defineStore } from 'pinia'
import { ref } from 'vue'

// Todoist流の左下トースト。一度に1件、既定6秒で消える。
// action付きで出すと「取り消す」等のリンクを表示する
export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  function show(opts: { message: string; actionLabel?: string; onAction?: () => void | Promise<void>; duration?: number }) {
    clearTimeout(timer)
    const id = ++seq
    current.value = { id, message: opts.message, actionLabel: opts.actionLabel, onAction: opts.onAction }
    timer = setTimeout(() => {
      if (current.value?.id === id) current.value = null
    }, opts.duration ?? 6000)
  }

  async function runAction() {
    const t = current.value
    current.value = null
    clearTimeout(timer)
    await t?.onAction?.()
  }

  function dismiss() {
    current.value = null
    clearTimeout(timer)
  }

  return { current, show, runAction, dismiss }
})
