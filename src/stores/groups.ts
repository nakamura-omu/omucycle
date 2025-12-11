import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Group {
  id: string
  name: string
  created_by: string
  created_by_name: string
  member_count: number
  active_tasks: number
  created_at: string
  updated_at: string
}

export interface GroupMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  joined_at: string
}

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<Group[]>([])
  const currentGroup = ref<Group | null>(null)
  const members = ref<GroupMember[]>([])
  const isLoading = ref(false)

  async function fetchGroups() {
    isLoading.value = true
    try {
      const res = await fetch('/api/groups')
      groups.value = await res.json()
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchGroup(groupId: string) {
    isLoading.value = true
    try {
      const res = await fetch(`/api/groups/${groupId}`)
      if (res.ok) {
        currentGroup.value = await res.json()
      }
    } catch (error) {
      console.error('Failed to fetch group:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchMembers(groupId: string) {
    try {
      const res = await fetch(`/api/groups/${groupId}/members`)
      members.value = await res.json()
    } catch (error) {
      console.error('Failed to fetch members:', error)
    }
  }

  async function createGroup(name: string, createdBy: string) {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, created_by: createdBy }),
    })
    if (res.ok) {
      const newGroup = await res.json()
      groups.value.unshift(newGroup)
      return newGroup
    }
    throw new Error('Failed to create group')
  }

  return {
    groups,
    currentGroup,
    members,
    isLoading,
    fetchGroups,
    fetchGroup,
    fetchMembers,
    createGroup,
  }
})
