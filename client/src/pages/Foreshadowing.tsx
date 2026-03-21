// client/src/pages/Foreshadowing.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { foreshadowingApi, ForeshadowingEntry } from '../api/api'

export default function ForeshadowingPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<ForeshadowingEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<ForeshadowingEntry>>({ setup: '', plannedPayoff: '', status: 'open' })

  useEffect(() => { loadEntries() }, [projectId])

  const loadEntries = () => {
    if (!projectId) return
    setLoading(true)
    foreshadowingApi.list(projectId).then(setEntries).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      await foreshadowingApi.create(projectId, formData)
      setShowForm(false)
      setFormData({ setup: '', plannedPayoff: '', status: 'open' })
      loadEntries()
    } catch (error) {
      console.error('Failed to save entry:', error)
      alert('Failed to save foreshadowing entry')
    }
  }

  const handleUpdateStatus = async (entry: ForeshadowingEntry, status: 'open' | 'resolved') => {
    if (!projectId) return
    try { await foreshadowingApi.update(projectId, entry.id, { status }); loadEntries() } catch { alert('Failed to update') }
  }

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Foreshadowing Ledger</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Foreshadowing Entry</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Setup *</label>
            <textarea value={formData.setup} onChange={(e) => setFormData({ ...formData, setup: e.target.value })}
              className="w-full px-3 py-2 border rounded" rows={3} placeholder="What hint are you planting?" required />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Planned Payoff</label>
            <textarea value={formData.plannedPayoff || ''} onChange={(e) => setFormData({ ...formData, plannedPayoff: e.target.value })}
              className="w-full px-3 py-2 border rounded" rows={3} placeholder="What will this lead to?" />
          </div>
          <div className="mt-6"><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Entry</button></div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.id} className={`bg-white p-6 rounded-lg shadow border-l-4 ${entry.status === 'resolved' ? 'border-green-500' : 'border-yellow-500'}`}>
            <div className="flex items-start justify-between mb-4">
              <span className={`px-2 py-1 rounded text-xs ${entry.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {entry.status}
              </span>
              <button onClick={() => handleUpdateStatus(entry, entry.status === 'open' ? 'resolved' : 'open')}
                className="text-sm text-blue-600 hover:underline">
                {entry.status === 'open' ? 'Mark Resolved' : 'Reopen'}
              </button>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Setup:</h4>
              <p className="text-gray-600 text-sm">{entry.setup}</p>
            </div>
            {entry.plannedPayoff && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">Planned Payoff:</h4>
                <p className="text-gray-600 text-sm">{entry.plannedPayoff}</p>
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && <div className="col-span-full text-center py-12 bg-gray-100 rounded-lg">
          <p className="text-gray-500">No foreshadowing entries yet.</p>
        </div>}
      </div>
    </div>
  )
}
