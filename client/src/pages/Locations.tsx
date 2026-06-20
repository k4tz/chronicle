// client/src/pages/Locations.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { locationsApi, Location } from '../api/api'

function errorDetail(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { details?: string; error?: string } } }
  return e?.response?.data?.details || e?.response?.data?.error || fallback
}

export default function LocationsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<Location[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null)
  const [genData, setGenData] = useState({ type: '', purpose: '', atmosphere: '' })
  const [formData, setFormData] = useState<Partial<Location>>({
    name: '',
    region: '',
    description: '',
    atmosphere: '',
    lore: '',
    currentState: '',
  })

  useEffect(() => {
    loadLocations()
  }, [projectId])

  const loadLocations = () => {
    if (!projectId) return
    setLoading(true)
    locationsApi.list(projectId)
      .then(setLocations)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return

    try {
      if (editingLoc) {
        await locationsApi.update(projectId, editingLoc.id, formData)
      } else {
        await locationsApi.create(projectId, formData)
      }
      setShowForm(false)
      setEditingLoc(null)
      setFormData({ name: '', region: '', description: '', atmosphere: '', lore: '', currentState: '' })
      loadLocations()
    } catch (error) {
      console.error('Failed to save location:', error)
      alert('Failed to save location')
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setGenerating(true)
    setGenStatus(null)
    try {
      const { location } = await locationsApi.generate(projectId, genData)
      setGenData({ type: '', purpose: '', atmosphere: '' })
      loadLocations()
      setGenStatus({ kind: 'success', msg: `Generated "${location.name}".` })
    } catch (error) {
      console.error('Failed to generate location:', error)
      setGenStatus({ kind: 'error', msg: errorDetail(error, 'Generation failed. Is the model server reachable?') })
    } finally {
      setGenerating(false)
    }
  }

  const handleEdit = (loc: Location) => {
    setEditingLoc(loc)
    setFormData({
      name: loc.name,
      region: loc.region || '',
      description: loc.description || '',
      atmosphere: loc.atmosphere || '',
      lore: loc.lore || '',
      currentState: loc.currentState || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this location?')) return

    try {
      await locationsApi.delete(projectId, id)
      loadLocations()
    } catch (error) {
      console.error('Failed to delete location:', error)
      alert('Failed to delete location')
    }
  }

  if (loading) return <div className="p-8">Loading locations...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Locations</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            ← Back to Project
          </button>
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            ✨ AI Generate
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingLoc(null); setFormData({ name: '', region: '', description: '', atmosphere: '', lore: '', currentState: '' }) }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Location'}
          </button>
        </div>
      </div>

      {showGenerate && (
        <form onSubmit={handleGenerate} className="mb-8 bg-gray-800 p-6 rounded-lg border border-purple-500/40">
          <h2 className="text-lg font-semibold mb-3 text-gray-100">AI Location Generator</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Type *</label>
              <input type="text" value={genData.type} onChange={(e) => setGenData({ ...genData, type: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., Ancient ruin, Capital city" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Purpose</label>
              <input type="text" value={genData.purpose} onChange={(e) => setGenData({ ...genData, purpose: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., Site of the final battle" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Atmosphere</label>
              <input type="text" value={genData.atmosphere} onChange={(e) => setGenData({ ...genData, atmosphere: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., Eerie, foreboding" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className={`text-sm ${genStatus?.kind === 'error' ? 'text-red-400' : 'text-green-400'}`} aria-live="polite">
              {generating ? 'The model is building a location — this can take a minute…' : genStatus?.msg || ''}
            </p>
            <button type="submit" disabled={generating || !genData.type}
              className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shrink-0">
              {generating ? 'Generating...' : 'Generate Location'}
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{editingLoc ? 'Edit Location' : 'New Location'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Region</label>
              <input
                type="text"
                value={formData.region || ''}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Atmosphere</label>
              <textarea
                value={formData.atmosphere || ''}
                onChange={(e) => setFormData({ ...formData, atmosphere: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Lore</label>
              <textarea
                value={formData.lore || ''}
                onChange={(e) => setFormData({ ...formData, lore: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Current State</label>
            <textarea
              value={formData.currentState || ''}
              onChange={(e) => setFormData({ ...formData, currentState: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
          <div className="mt-6">
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {editingLoc ? 'Update' : 'Create'} Location
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <div key={loc.id} className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold">{loc.name}</h3>
            {loc.region && <p className="text-gray-500 text-sm">{loc.region}</p>}
            {loc.description && <p className="text-gray-600 mt-2 text-sm line-clamp-2">{loc.description}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => handleEdit(loc)} className="text-sm text-blue-600 hover:underline">Edit</button>
              <button onClick={() => handleDelete(loc.id)} className="text-sm text-red-600 hover:underline">Delete</button>
            </div>
          </div>
        ))}
        {locations.length === 0 && (
          <div className="col-span-full text-center py-12 bg-gray-100 rounded-lg">
            <p className="text-gray-500">No locations yet. Add one above!</p>
          </div>
        )}
      </div>
    </div>
  )
}
