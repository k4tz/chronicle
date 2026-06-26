// client/src/store/projects.ts
import { create } from 'zustand'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, Project, ProjectWithRelations, CreateProjectInput } from '../api/client'

const STORAGE_KEY = 'selectedProjectId'

interface ProjectsStore {
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}

const initialSelectedProjectId =
  typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null

// Single source of truth for the active project. Persisted to localStorage so a
// page reload (or navigating to a route without a :projectId param) keeps the
// sidebar populated.
export const useProjectsStore = create<ProjectsStore>((set) => ({
  selectedProjectId: initialSelectedProjectId,
  setSelectedProjectId: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    }
    set({ selectedProjectId: id })
  },
}))

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await apiClient.get<Project[]>('/projects')
      return response.data
    },
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await apiClient.get<ProjectWithRelations>(`/projects/${id}`)
      return response.data
    },
    enabled: !!id,
  })
}

// A plausible full Project row for optimistic inserts (replaced by the real row
// on settle). Mirrors the server's create defaults.
function optimisticProject(data: CreateProjectInput): Project {
  const now = new Date().toISOString()
  return {
    id: `optimistic-${now}`,
    title: data.title,
    logline: data.logline ?? null,
    genre: data.genre ?? null,
    tone: data.tone ?? null,
    contentRating: data.contentRating ?? 'general',
    pov: data.pov ?? 'third-limited',
    targetWordCount: data.targetWordCount ?? 100000,
    currentWordCount: 0,
    recentChaptersCount: 3,
    minRecentChapters: 1,
    maxRecentChapters: 5,
    minWordCountPerChapter: 2000,
    createdAt: now,
    updatedAt: now,
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProjectInput) => {
      const response = await apiClient.post<Project>('/projects', data)
      return response.data
    },
    // Optimistic: show the new project in the list immediately, roll back on error.
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const previous = queryClient.getQueryData<Project[]>(['projects'])
      queryClient.setQueryData<Project[]>(['projects'], (old) => [...(old || []), optimisticProject(data)])
      return { previous }
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['projects'], ctx.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/projects/${id}`)
      return response.data
    },
    // Optimistic: remove the row immediately so the list doesn't wait on the
    // round-trip; restore it if the delete fails.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const previous = queryClient.getQueryData<Project[]>(['projects'])
      queryClient.setQueryData<Project[]>(['projects'], (old) => (old || []).filter((p) => p.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['projects'], ctx.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
