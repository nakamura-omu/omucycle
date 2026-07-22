import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Task } from './tasks'

// ドラッグ中タスクのグローバル共有。
// ビュー内の並べ替えだけでなく、サイドバー（今日/近日予定/インボックス/プロジェクト）への
// ドロップ移動を可能にするため、TaskRowのdragstart/dragendでここに載せる
export const useDndStore = defineStore('dnd', () => {
  const draggedTask = ref<Task | null>(null)

  function start(task: Task) { draggedTask.value = task }
  function end() { draggedTask.value = null }

  return { draggedTask, start, end }
})
