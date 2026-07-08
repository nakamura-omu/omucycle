import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'

export interface Project {
  id: string
  group_id: string
  parent_project_id: string | null
  name: string
  slug: string
  prefix: string | null
  description: string | null
  icon: string | null
  color: string | null
  archived: number
  is_personal: number
  owner_user_id: string | null
  next_task_number: number
  next_cycle_number: number
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
  active_tasks?: number
  total_tasks?: number
  group_slug?: string
  group_name?: string
  stats?: {
    total: number
    completed: number
    in_progress: number
    not_started: number
  }
}

export interface Cycle {
  id: string
  project_id: string
  cycle_number: number
  name: string
  description: string | null
  start_date: string
  end_date: string
  status: 'upcoming' | 'active' | 'completed'
  sort_order: number
  created_at: string
}

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const cycles = ref<Cycle[]>([])
  const isLoading = ref(false)

  async function fetchGroupProjects(groupId: string, opts: { includePersonal?: boolean } = {}) {
    isLoading.value = true
    try {
      const qs = opts.includePersonal ? '?include_personal=true' : ''
      const res = await api(`/api/groups/${groupId}/projects${qs}`)
      if (res.ok) projects.value = await res.json()
    } catch (e) { console.error('fetchGroupProjects failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchProject(id: string) {
    isLoading.value = true
    try {
      const res = await api(`/api/projects/${id}`)
      if (res.ok) currentProject.value = await res.json()
    } catch (e) { console.error('fetchProject failed:', e) }
    finally { isLoading.value = false }
  }

  async function fetchProjectBySlug(groupSlug: string, projectSlug: string) {
    isLoading.value = true
    try {
      const res = await api(`/api/browse/${groupSlug}/projects/${projectSlug}`)
      if (res.ok) {
        const data = await res.json()
        currentProject.value = data
        return data
      }
    } catch (e) { console.error('fetchProjectBySlug failed:', e) }
    finally { isLoading.value = false }
    return null
  }

  async function fetchCycles(projectId: string) {
    try {
      const res = await api(`/api/projects/${projectId}/cycles`)
      if (res.ok) cycles.value = await res.json()
    } catch (e) { console.error('fetchCycles failed:', e) }
  }

  async function createProject(data: Partial<Project> & { group_id: string; name: string; slug: string; created_by: string }) {
    const res = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create project')
    }
    const newProject = await res.json()
    projects.value.push(newProject)
    return newProject
  }

  async function updateProject(id: string, data: Partial<Project>) {
    const res = await api(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update project')
    const updated = await res.json()
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx !== -1) projects.value[idx] = updated
    if (currentProject.value?.id === id) currentProject.value = { ...currentProject.value, ...updated }
    return updated
  }

  async function deleteProject(id: string) {
    const res = await api(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete project')
    projects.value = projects.value.filter(p => p.id !== id)
  }

  return {
    projects, currentProject, cycles, isLoading,
    fetchGroupProjects, fetchProject, fetchProjectBySlug, fetchCycles,
    createProject, updateProject, deleteProject,
  }
})
