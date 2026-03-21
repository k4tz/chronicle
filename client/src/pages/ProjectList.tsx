import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore, useProjects, useCreateProject, useDeleteProject } from '../store/projects'

export default function ProjectList() {
  const navigate = useNavigate()
  const setSelectedProjectId = useProjectsStore((state) => state.setSelectedProjectId)
  const { data: projects, isLoading } = useProjects()
  const createMutation = useCreateProject()
  const deleteMutation = useDeleteProject()

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ title: '', logline: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    try {
      const project = await createMutation.mutateAsync(formData)
      setSelectedProjectId(project.id)
      setFormData({ title: '', logline: '' })
      setShowForm(false)
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
      } catch (error) {
        console.error('Failed to delete project:', error)
      }
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
        >
          {showForm ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {/* Create Project Form - Toggle */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-blue-200 dark:border-blue-800">
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
                autoFocus
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

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Project'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setFormData({ title: '', logline: '' })
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Projects Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Loading projects...</p>
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No projects yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Title</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Logline</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Words</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Created</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project, index) => (
                  <tr
                    key={project.id}
                    className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                      index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          setSelectedProjectId(project.id)
                          navigate(`/projects/${project.id}`)
                        }}
                        className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {project.title}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                        {project.logline || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                        {project.currentWordCount.toLocaleString()} / {project.targetWordCount.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setSelectedProjectId(project.id)
                            navigate(`/projects/${project.id}`)
                          }}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Open
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(project.id)
                          }}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {projects && projects.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {projects.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Projects</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {projects.reduce((sum, p) => sum + p.currentWordCount, 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Words Written</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {Math.round(
                (projects.reduce((sum, p) => sum + p.currentWordCount, 0) /
                  projects.reduce((sum, p) => sum + p.targetWordCount, 0)) * 100
              )}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Overall Progress</div>
          </div>
        </div>
      )}
    </div>
  )
}
