<script setup lang="ts">
import { computed } from 'vue'

interface TaskTemplate {
  id: string
  title: string
  description: string | null
  relative_days: number
  default_assignee_id: string | null
  default_assignee_ids: string[] | null
  sort_order: number
  depth: number
  parent_template_id: string | null
}

interface TemplateTreeNode extends TaskTemplate {
  children?: TemplateTreeNode[]
}

interface Member {
  id: string
  name: string
}

const props = defineProps<{
  templates: TaskTemplate[]
  members: Member[]
}>()

const emit = defineEmits<{
  'add': [parentId?: string]
  'edit': [template: TaskTemplate]
  'delete': [template: TaskTemplate]
}>()

// テンプレートをツリー構造で表示用に整形
const templateTree = computed<TemplateTreeNode[]>(() => {
  const templates = props.templates
  const roots = templates.filter(t => !t.parent_template_id)

  function buildTree(parent: TaskTemplate): TemplateTreeNode {
    const children = templates.filter(t => t.parent_template_id === parent.id)
    return {
      ...parent,
      children: children.map(buildTree)
    }
  }

  return roots.map(buildTree)
})

// 担当者名を取得（複数対応）
function getAssigneeNames(template: TaskTemplate): string[] {
  const names: string[] = []
  if (template.default_assignee_ids && template.default_assignee_ids.length > 0) {
    for (const id of template.default_assignee_ids) {
      const member = props.members.find(m => m.id === id)
      if (member) names.push(member.name)
    }
  } else if (template.default_assignee_id) {
    const member = props.members.find(m => m.id === template.default_assignee_id)
    if (member) names.push(member.name)
  }
  return names
}

function handleDelete(template: TaskTemplate) {
  if (!confirm(`「${template.title}」を削除しますか？`)) return
  emit('delete', template)
}
</script>

<template>
  <div class="templates-section">
    <div class="section-header">
      <h2>含まれるタスク</h2>
      <button class="btn btn-primary btn-sm" @click="$emit('add')">
        + タスク追加
      </button>
    </div>

    <div v-if="templateTree.length === 0" class="empty-templates">
      <p>タスクがありません</p>
      <p class="hint">タスクを追加して、業務を実行した際に自動でタスクが作成されるようにしましょう</p>
    </div>

    <div v-else class="template-list">
      <template v-for="template in templateTree" :key="template.id">
        <div class="template-item depth-0">
          <div class="template-main">
            <div class="template-content">
              <span class="template-title">{{ template.title }}</span>
              <span v-if="template.description" class="template-desc">{{ template.description }}</span>
              <div class="template-meta">
                <span class="template-timing">+{{ template.relative_days }}日</span>
                <span
                  v-for="name in getAssigneeNames(template)"
                  :key="name"
                  class="template-assignee"
                >
                  {{ name }}
                </span>
              </div>
            </div>
            <div class="template-actions">
              <button class="btn btn-sm btn-secondary" @click="$emit('edit', template)">
                編集
              </button>
              <button class="btn btn-sm btn-secondary" @click="$emit('add', template.id)">
                子タスク
              </button>
              <button class="btn btn-sm btn-danger" @click="handleDelete(template)">
                削除
              </button>
            </div>
          </div>

          <!-- 子テンプレート -->
          <div v-if="template.children?.length" class="children-templates">
            <template v-for="child in template.children" :key="child.id">
              <div class="template-item depth-1">
                <div class="template-main">
                  <div class="template-content">
                    <span class="template-title">{{ child.title }}</span>
                    <span v-if="child.description" class="template-desc">{{ child.description }}</span>
                    <div class="template-meta">
                      <span class="template-timing">+{{ child.relative_days }}日</span>
                      <span
                        v-for="name in getAssigneeNames(child)"
                        :key="name"
                        class="template-assignee"
                      >
                        {{ name }}
                      </span>
                    </div>
                  </div>
                  <div class="template-actions">
                    <button class="btn btn-sm btn-secondary" @click="$emit('edit', child)">
                      編集
                    </button>
                    <button class="btn btn-sm btn-secondary" @click="$emit('add', child.id)">
                      子タスク
                    </button>
                    <button class="btn btn-sm btn-danger" @click="handleDelete(child)">
                      削除
                    </button>
                  </div>
                </div>

                <!-- 孫テンプレート -->
                <div v-if="child.children?.length" class="children-templates">
                  <div
                    v-for="grandchild in child.children"
                    :key="grandchild.id"
                    class="template-item depth-2"
                  >
                    <div class="template-main">
                      <div class="template-content">
                        <span class="template-title">{{ grandchild.title }}</span>
                        <span v-if="grandchild.description" class="template-desc">{{ grandchild.description }}</span>
                        <div class="template-meta">
                          <span class="template-timing">+{{ grandchild.relative_days }}日</span>
                          <span
                            v-for="name in getAssigneeNames(grandchild)"
                            :key="name"
                            class="template-assignee"
                          >
                            {{ name }}
                          </span>
                        </div>
                      </div>
                      <div class="template-actions">
                        <button class="btn btn-sm btn-secondary" @click="$emit('edit', grandchild)">
                          編集
                        </button>
                        <button class="btn btn-sm btn-danger" @click="handleDelete(grandchild)">
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.templates-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h2 {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0;
}

.empty-templates {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty-templates .hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.5rem;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.template-item {
  border-radius: 8px;
  overflow: hidden;
}

.template-item.depth-0 {
  background: #f8f9fa;
}

.template-item.depth-1 {
  background: #fff;
  border: 1px solid #e0e0e0;
  margin-left: 1.5rem;
}

.template-item.depth-2 {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  margin-left: 1.5rem;
}

.template-main {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
}

.template-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.template-title {
  font-weight: 500;
  color: #1a1a2e;
}

.template-desc {
  font-size: 0.8125rem;
  color: #666;
}

.template-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.template-timing {
  font-size: 0.75rem;
  color: #999;
}

.template-assignee {
  font-size: 0.75rem;
  color: #4338ca;
  background: #e0e7ff;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.template-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.children-templates {
  padding-bottom: 0.5rem;
}

/* ボタン */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #4cc9f0;
  color: #1a1a2e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}
</style>
