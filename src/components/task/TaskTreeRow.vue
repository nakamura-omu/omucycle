<script setup lang="ts">
import { ref } from 'vue'
import TaskRow from './TaskRow.vue'
import type { Task } from '@/stores/tasks'

defineOptions({ name: 'TaskTreeRow' })

export interface TaskTreeNode {
  task: Task
  children: TaskTreeNode[]
}

defineProps<{
  node: TaskTreeNode
  groupSlug?: string
  projectSlug?: string
  draggable?: boolean
  dragOverTaskId?: string | null
  dragOverPos?: 'above' | 'below' | 'child' | null
}>()

const emit = defineEmits<{
  toggle: [task: Task]
  click: [task: Task]
  dragstart: [event: DragEvent, task: Task]
  dragover: [event: DragEvent, task: Task]
  drop: [event: DragEvent, task: Task]
  dragend: [event: DragEvent]
}>()

const collapsed = ref(false)
function toggleCollapse() { collapsed.value = !collapsed.value }
</script>

<template>
  <div>
    <TaskRow
      :task="node.task"
      :group-slug="groupSlug"
      :project-slug="projectSlug"
      :draggable="draggable"
      :collapsible="node.children.length > 0"
      :collapsed="collapsed"
      :drop-indicator="node.task.id === dragOverTaskId ? dragOverPos : null"
      @toggle="(t) => emit('toggle', t)"
      @click="(t) => emit('click', t)"
      @dragstart="(e, t) => emit('dragstart', e, t)"
      @dragover="(e, t) => emit('dragover', e, t)"
      @drop="(e, t) => emit('drop', e, t)"
      @dragend="(e) => emit('dragend', e)"
      @toggle-collapse="toggleCollapse"
    />
    <div v-if="node.children.length > 0 && !collapsed" class="ml-5 border-l border-border pl-1">
      <TaskTreeRow
        v-for="c in node.children"
        :key="c.task.id"
        :node="c"
        :group-slug="groupSlug"
        :project-slug="projectSlug"
        :draggable="draggable"
        :drag-over-task-id="dragOverTaskId"
        :drag-over-pos="dragOverPos"
        @toggle="(t) => emit('toggle', t)"
        @click="(t) => emit('click', t)"
        @dragstart="(e, t) => emit('dragstart', e, t)"
        @dragover="(e, t) => emit('dragover', e, t)"
        @drop="(e, t) => emit('drop', e, t)"
        @dragend="(e) => emit('dragend', e)"
      />
    </div>
  </div>
</template>
