// client/src/pages/ProjectList.tsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore, useProjects, useCreateProject, useDeleteProject } from '../store/projects'

export default function ProjectList() {
  const navigate = useNavigate()
  const setSelectedProjectId = useProjectsStore((state) => state.setSelectedProjectId)
  const { data: projects, isLoading } = useProjects()
  const createMutation = useCreateProject()
  const deleteMutation = useDeleteProject()

  const [formData, setFormData] = useState({ title: '', logline: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    try {
      const project = await createMutation.mutateAsync(formData)
      setSelectedProjectId(project.id)
      navigate(`/projects/${project.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteMutation.mutateAsync(id)
        setSelectedProjectId(null)
        navigate('/')
      } catch (error) {
        console.error('Failed to delete project:', error)
      }
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">Your Projects</h1>

      {/* Create Project Form */}
      <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Create New Project</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              placeholder="Enter project title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Logline (optional)</label>
            <textarea
              value={formData.logline}
              onChange={(e) => setFormData({ ...formData, logline: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              placeholder="Brief description of your story"
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>

      {/* Project List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Loading state */}
        {isLoading && (
          <div className="col-span-full text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">Loading projects...</p>
          </div>
        )}

        {/* No projects message */}
        {!isLoading && (!projects || projects.length === 0) && (
          <div className="col-span-full text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">No projects yet. Create one above!</p>
          </div>
        )}

        {/* Existing projects */}
        {projects && projects.map((project) => (
          <div
            key={project.id}
            className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition"
          >
            <button
              onClick={() => {
                setSelectedProjectId(project.id)
                navigate(`/projects/${project.id}`)
              }}
              className="text-left w-full"
            >
              <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{project.title}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </button>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {project.currentWordCount.toLocaleString()} / {project.targetWordCount.toLocaleString()} words
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(project.id)
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
