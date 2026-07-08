import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'

export interface WikiPage {
  id: string
  group_id: string
  parent_page_id: string | null
  title: string
  slug: string
  content: string
  icon: string | null
  sort_order: number
  archived: number
  created_by: string
  updated_by: string | null
  updated_by_name?: string
  created_at: string
  updated_at: string
}

export interface WikiTreeNode extends WikiPage {
  children: WikiTreeNode[]
}

export const useWikiStore = defineStore('wiki', () => {
  const pages = ref<WikiPage[]>([])
  const currentPage = ref<WikiPage | null>(null)
  const isLoading = ref(false)

  async function fetchTree(groupId: string) {
    isLoading.value = true
    try {
      const res = await api(`/api/wiki/groups/${groupId}/pages`)
      if (res.ok) pages.value = await res.json()
    } catch (e) { console.error('fetchTree:', e) }
    finally { isLoading.value = false }
  }

  async function fetchBySlug(groupId: string, slug: string) {
    const res = await api(`/api/wiki/groups/${groupId}/pages/by-slug/${slug}`)
    if (res.ok) {
      currentPage.value = await res.json()
      return currentPage.value
    }
    return null
  }

  async function createPage(data: Partial<WikiPage> & { group_id: string; title: string; slug: string; created_by: string }) {
    const res = await api('/api/wiki/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed')
    }
    const newPage = await res.json()
    pages.value.push(newPage)
    return newPage as WikiPage
  }

  async function updatePage(id: string, data: Partial<WikiPage>) {
    const res = await api(`/api/wiki/pages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed')
    const updated = await res.json()
    const idx = pages.value.findIndex(p => p.id === id)
    if (idx !== -1) pages.value[idx] = updated
    if (currentPage.value?.id === id) currentPage.value = updated
    return updated as WikiPage
  }

  async function deletePage(id: string) {
    const res = await api(`/api/wiki/pages/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed')
    pages.value = pages.value.filter(p => p.id !== id)
  }

  function buildTree(parentId: string | null = null): WikiTreeNode[] {
    return pages.value
      .filter(p => p.parent_page_id === parentId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(p => ({ ...p, children: buildTree(p.id) }))
  }

  return { pages, currentPage, isLoading, fetchTree, fetchBySlug, createPage, updatePage, deletePage, buildTree }
})
