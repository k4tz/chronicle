// client/src/pages/StoryArcs.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { arcsApi, StoryArc } from '../api/api'

export default function StoryArcsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [arcs, setArcs] = useState<StoryArc[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<StoryArc>>({ name: '', description: '', status: 'planned' })

  useEffect(() => { loadArcs() }, [projectId])

  const loadArcs = () => {
    if (!projectId) return
    setLoading(true)
    arcsApi.list(projectId).then(setArcs).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      await arcsApi.create(projectId, formData)
      setShowForm(false)
      setFormData({ name: '', description: '', status: 'planned' })
      loadArcs()
    } catch (error) {
      console.error('Failed to save arc:', error)
      alert('Failed to save story arc')
    }
  }

  const handleUpdateStatus = async (arc: StoryArc, status: StoryArc['status']) => {
    if (!projectId) return
    try { await arcsApi.update(projectId, arc.id, { status }); loadArcs() } catch { alert('Failed to update') }
  }

  if (loading) return <div className="p-8">Loading arcs...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Story Arcs</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Arc'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Story Arc</h2>
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
          <div className="mt-6"><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Arc</button></div>
        </form>
      )}

      <div className="space-y-4">
        {arcs.map((arc, index) => (
          <div key={arc.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-gray-300 dark:text-gray-600 w-8">{index + 1}</span>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{arc.name}</h3>
                {arc.description && <p className="text-gray-600 dark:text-gray-400 text-sm">{arc.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded text-sm ${
                arc.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                arc.status === 'resolved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>{arc.status}</span>
              <div className="flex gap-2">
                {arc.status !== 'active' && <button onClick={() => handleUpdateStatus(arc, 'active')} className="text-sm text-green-600 hover:underline">Activate</button>}
                {arc.status !== 'resolved' && <button onClick={() => handleUpdateStatus(arc, 'resolved')} className="text-sm text-blue-600 hover:underline">Resolve</button>}
              </div>
            </div>
          </div>
        ))}
        {arcs.length === 0 && <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">No story arcs yet.</p>
        </div>}
      </div>
    </div>
  )
}
