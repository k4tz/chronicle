// client/src/store/projects.ts
import { create } from 'zustand'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useState, useEffect, ReactNode, createElement } from 'react'
import { apiClient, Project, ProjectWithRelations, CreateProjectInput } from '../api/client'

interface ProjectsStore {
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
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

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProjectInput) => {
      const response = await apiClient.post<Project>('/projects', data)
      return response.data
    },
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export const ProjectsContext = createContext<{
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
})

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('selectedProjectId')
    if (saved) {
      setSelectedProjectId(saved)
    }
  }, [])

  const handleSetSelectedProjectId = (id: string | null) => {
    setSelectedProjectId(id)
    if (id) {
      localStorage.setItem('selectedProjectId', id)
    } else {
      localStorage.removeItem('selectedProjectId')
    }
  }

  return createElement(ProjectsContext.Provider, { value: { selectedProjectId, setSelectedProjectId: handleSetSelectedProjectId } }, children)
}

export function useProjectsContext() {
  const context = useContext(ProjectsContext)
  if (!context) {
    throw new Error('useProjectsContext must be used within a ProjectsProvider')
  }
  return context
}