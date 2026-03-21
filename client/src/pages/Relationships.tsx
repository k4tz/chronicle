// client/src/pages/Relationships.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { relationshipsApi, charactersApi, Relationship, Character } from '../api/api'
import RelationshipGraph from '../components/RelationshipGraph'

export default function RelationshipsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<Relationship>>({
    fromCharId: '',
    toCharId: '',
    type: 'ally',
    history: '',
    currentDynamic: '',
    intensity: 3,
  })

  useEffect(() => { loadData() }, [projectId])

  const loadData = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      relationshipsApi.list(projectId),
      charactersApi.list(projectId),
    ]).then(([rels, chars]) => {
      setRelationships(rels)
      setCharacters(chars)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !formData.fromCharId || !formData.toCharId) return
    try {
      await relationshipsApi.create(projectId, formData)
      setShowForm(false)
      setFormData({ fromCharId: '', toCharId: '', type: 'ally', history: '', currentDynamic: '', intensity: 3 })
      loadData()
    } catch (error) {
      console.error('Failed to save relationship:', error)
      alert('Failed to save relationship')
    }
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this relationship?')) return
    try { await relationshipsApi.delete(projectId, id); loadData() } catch { alert('Failed to delete') }
  }

  const getCharName = (id: string) => characters.find(c => c.id === id)?.name || 'Unknown'

  const relationshipTypes = ['ally', 'rival', 'romantic', 'mentor', 'family', 'enemy', 'friend', 'acquaintance']

  if (loading) return <div className="p-8">Loading relationships...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Character Relationships</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Relationship'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Relationship</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">From Character *</label>
              <select value={formData.fromCharId} onChange={(e) => setFormData({ ...formData, fromCharId: e.target.value })}
                className="w-full px-3 py-2 border rounded" required>
                <option value="">Select character</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">To Character *</label>
              <select value={formData.toCharId} onChange={(e) => setFormData({ ...formData, toCharId: e.target.value })}
                className="w-full px-3 py-2 border rounded" required>
                <option value="">Select character</option>
                {characters.filter(c => c.id !== formData.fromCharId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border rounded">
              {relationshipTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">History</label>
            <textarea value={formData.history || ''} onChange={(e) => setFormData({ ...formData, history: e.target.value })}
              className="w-full px-3 py-2 border rounded" rows={3} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Current Dynamic</label>
              <textarea value={formData.currentDynamic || ''} onChange={(e) => setFormData({ ...formData, currentDynamic: e.target.value })}
                className="w-full px-3 py-2 border rounded" rows={2} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Intensity (1-5)</label>
              <input type="range" min="1" max="5" value={formData.intensity}
                onChange={(e) => setFormData({ ...formData, intensity: Number(e.target.value) })}
                className="w-full mt-2" />
              <span className="text-sm text-gray-600">Intensity: {formData.intensity}</span>
            </div>
          </div>
          <div className="mt-6"><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Relationship</button></div>
        </form>
      )}

      {/* Relationship Graph Visualization */}
      <div className="mb-8">
        <RelationshipGraph characters={characters} relationships={relationships} />
      </div>

      {/* Relationships List */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">All Relationships</h2>
        {relationships.map((rel) => (
          <div key={rel.id} className="bg-white p-4 rounded-lg shadow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-medium">{getCharName(rel.fromCharId)}</span>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{rel.type}</span>
              <span className="font-medium">{getCharName(rel.toCharId)}</span>
              {rel.currentDynamic && <span className="text-gray-500 text-sm">— {rel.currentDynamic}</span>}
              <span className="text-xs text-gray-400">Intensity: {rel.intensity}/5</span>
            </div>
            <button onClick={() => handleDelete(rel.id)} className="text-sm text-red-600 hover:underline">Delete</button>
          </div>
        ))}
        {relationships.length === 0 && <div className="text-center py-8 bg-gray-100 rounded-lg">
          <p className="text-gray-500">No relationships yet. Add one above!</p>
        </div>}
      </div>
    </div>
  )
}
