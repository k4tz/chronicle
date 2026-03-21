// client/src/api/client.ts
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3001/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Health check
export async function healthCheck() {
  const response = await apiClient.get('/health')
  return response.data
}

// LLM endpoints
export async function pingLLM() {
  const response = await apiClient.post('/llm/ping')
  return response.data
}

export async function listModels() {
  const response = await apiClient.get('/llm/models')
  return response.data
}

// Projects API
export interface Project {
  id: string
  title: string
  logline?: string | null
  genre?: string | null
  tone?: string | null
  contentRating: string
  pov: string
  targetWordCount: number
  currentWordCount: number
  // Snapshot/recency settings
  recentChaptersCount: number
  minRecentChapters: number
  maxRecentChapters: number
  createdAt: string
  updatedAt: string
}

export interface ProjectWithRelations {
  project: Project
  world: any | null
  arc: any | null
}

export interface CreateProjectInput {
  title: string
  logline?: string
  genre?: string
  tone?: string
  contentRating?: string
  pov?: string
  targetWordCount?: number
}

export interface ProjectSettingsInput {
  recentChaptersCount?: number
  minRecentChapters?: number
  maxRecentChapters?: number
}

export const projectsApi = {
  async list(): Promise<Project[]> {
    const response = await apiClient.get('/projects')
    return response.data
  },

  async get(id: string): Promise<ProjectWithRelations> {
    const response = await apiClient.get(`/projects/${id}`)
    return response.data
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const response = await apiClient.post('/projects', input)
    return response.data
  },

  async update(id: string, input: Partial<CreateProjectInput>): Promise<Project> {
    const response = await apiClient.put(`/projects/${id}`, input)
    return response.data
  },

  async updateSettings(id: string, settings: ProjectSettingsInput): Promise<{ message: string; settings: ProjectSettingsInput }> {
    const response = await apiClient.put(`/projects/${id}/settings`, settings)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/projects/${id}`)
  },
}
