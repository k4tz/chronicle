// client/src/pages/PlotThreads.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { threadsApi, PlotThread } from '../api/api'

export default function PlotThreadsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<PlotThread[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<PlotThread>>({ name: '', description: '', status: 'planted', urgency: 2 })

  useEffect(() => { loadThreads() }, [projectId])

  const loadThreads = () => {
    if (!projectId) return
    setLoading(true)
    threadsApi.list(projectId).then(setThreads).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      await threadsApi.create(projectId, formData)
      setShowForm(false)
      setFormData({ name: '', description: '', status: 'planted', urgency: 2 })
      loadThreads()
    } catch (error) {
      console.error('Failed to save thread:', error)
      alert('Failed to save plot thread')
    }
  }

  const handleUpdateStatus = async (thread: PlotThread, status: PlotThread['status']) => {
    if (!projectId) return
    try { await threadsApi.update(projectId, thread.id, { status }); loadThreads() } catch { alert('Failed to update') }
  }

  if (loading) return <div className="p-8">Loading threads...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Plot Threads</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Thread'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Plot Thread</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded" required />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded" rows={3} />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Urgency</label>
            <select value={formData.urgency} onChange={(e) => setFormData({ ...formData, urgency: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded">
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
          </div>
          <div className="mt-6"><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Thread</button></div>
        </form>
      )}

      <div className="space-y-4">
        {threads.map((thread) => (
          <div key={thread.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{thread.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${
                    thread.urgency === 3 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                    thread.urgency === 2 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}>Urgency: {thread.urgency}</span>
                </div>
                {thread.description && <p className="text-gray-600 dark:text-gray-400 mt-2">{thread.description}</p>}
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded text-sm ${
                  thread.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                  thread.status === 'resolved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                  thread.status === 'dropped' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                }`}>{thread.status}</span>
                <div className="flex gap-2">
                  {thread.status === 'planted' && <button onClick={() => handleUpdateStatus(thread, 'active')} className="text-sm text-green-600 hover:underline">Activate</button>}
                  {thread.status !== 'resolved' && thread.status !== 'dropped' && (
                    <>
                      <button onClick={() => handleUpdateStatus(thread, 'resolved')} className="text-sm text-blue-600 hover:underline">Resolve</button>
                      <button onClick={() => handleUpdateStatus(thread, 'dropped')} className="text-sm text-gray-600 hover:underline">Drop</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {threads.length === 0 && <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">No plot threads yet.</p>
        </div>}
      </div>
    </div>
  )
}
