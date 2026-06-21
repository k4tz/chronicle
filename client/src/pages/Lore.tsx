// client/src/pages/Lore.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loreApi, charactersApi, locationsApi, LoreEntry, Character, Location } from '../api/api'
import { findEntityLinks, renderTextWithLinks, LinkedEntity } from '../utils/crossReference'
import { errorDetail } from '../utils/errors'

export default function LorePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [lore, setLore] = useState<LoreEntry[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LoreEntry | null>(null)
  const [formData, setFormData] = useState<Partial<LoreEntry>>({ title: '', category: '', content: '', tags: '' })
  const [showAutoLinks, setShowAutoLinks] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null)
  const [genData, setGenData] = useState({ topic: '', category: '', notes: '' })

  useEffect(() => { loadAllData() }, [projectId])

  const loadAllData = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      loreApi.list(projectId),
      charactersApi.list(projectId),
      locationsApi.list(projectId),
    ]).then(([loreData, chars, locs]) => {
      setLore(loreData)
      setCharacters(chars)
      setLocations(locs)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      if (editingEntry) {
        await loreApi.update(projectId, editingEntry.id, formData)
      } else {
        await loreApi.create(projectId, formData)
      }
      setShowForm(false)
      setEditingEntry(null)
      setFormData({ title: '', category: '', content: '', tags: '' })
      loadAllData()
    } catch (error) {
      console.error('Failed to save lore:', error)
      alert('Failed to save lore entry')
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setGenerating(true)
    setGenStatus(null)
    try {
      const { lore: created } = await loreApi.generate(projectId, genData)
      setGenData({ topic: '', category: '', notes: '' })
      loadAllData()
      setGenStatus({ kind: 'success', msg: `Generated "${created.title}".` })
    } catch (error) {
      console.error('Failed to generate lore:', error)
      setGenStatus({ kind: 'error', msg: errorDetail(error, 'Generation failed. Is the model server reachable?') })
    } finally {
      setGenerating(false)
    }
  }

  const handleEdit = (entry: LoreEntry) => {
    setEditingEntry(entry)
    setFormData({ title: entry.title, category: entry.category, content: entry.content, tags: entry.tags || '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this lore entry?')) return
    try { await loreApi.delete(projectId, id); loadAllData() } catch { alert('Failed to delete') }
  }

  const handleEntityClick = (entity: LinkedEntity) => {
    if (!projectId) return
    if (entity.type === 'character') {
      navigate(`/projects/${projectId}/characters`)
    } else if (entity.type === 'location') {
      navigate(`/projects/${projectId}/locations`)
    } else if (entity.type === 'lore') {
      // Scroll to or highlight the lore entry
      const element = document.getElementById(`lore-${entity.id}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const categories = [...new Set(lore.map(e => e.category))]

  if (loading) return <div className="p-8">Loading lore...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Lore Entries</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAutoLinks(!showAutoLinks)}
            className={`px-4 py-2 rounded ${showAutoLinks ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
            title="Auto-highlight entity names in content"
          >
            🔗 Auto-Links {showAutoLinks ? 'On' : 'Off'}
          </button>
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            ✨ AI Generate
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingEntry(null); setFormData({ title: '', category: '', content: '', tags: '' }) }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Lore'}
          </button>
        </div>
      </div>

      {showGenerate && (
        <form onSubmit={handleGenerate} className="mb-8 bg-gray-800 p-6 rounded-lg border border-purple-500/40">
          <h2 className="text-lg font-semibold mb-3 text-gray-100">AI Lore Generator</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Topic *</label>
              <input type="text" value={genData.topic} onChange={(e) => setGenData({ ...genData, topic: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., The Sundering War" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Category</label>
              <input type="text" value={genData.category} onChange={(e) => setGenData({ ...genData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="event, artifact, religion…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Notes</label>
              <input type="text" value={genData.notes} onChange={(e) => setGenData({ ...genData, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="any constraints or hooks" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className={`text-sm ${genStatus?.kind === 'error' ? 'text-red-400' : 'text-green-400'}`} aria-live="polite">
              {generating ? 'The model is writing lore — this can take a minute…' : genStatus?.msg || ''}
            </p>
            <button type="submit" disabled={generating || !genData.topic}
              className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shrink-0">
              {generating ? 'Generating...' : 'Generate Lore'}
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{editingEntry ? 'Edit Lore' : 'New Lore Entry'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="event, artifact, organization, species, etc."
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Content *</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              rows={6}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Entity names (characters, locations) will be auto-highlighted when viewing
            </p>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags || ''}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div className="mt-6">
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {editingEntry ? 'Update' : 'Create'} Entry
            </button>
          </div>
        </form>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          <span className="text-sm text-gray-600">Categories:</span>
          {categories.map(cat => (
            <span key={cat} className="text-xs bg-gray-200 px-2 py-1 rounded capitalize">{cat}</span>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {lore.map((entry) => {
          const links = showAutoLinks ? findEntityLinks(entry.content, characters, locations, lore) : []
          const contentDisplay = links.length > 0
            ? renderTextWithLinks(entry.content, links, handleEntityClick)
            : entry.content

          return (
            <div key={entry.id} id={`lore-${entry.id}`} className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{entry.title}</h3>
                  <span className="text-xs bg-gray-200 px-2 py-1 rounded">{entry.category}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(entry)} className="text-sm text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(entry.id)} className="text-sm text-red-600 hover:underline">Delete</button>
                </div>
              </div>
              <div className="text-gray-600 mt-4 text-sm whitespace-pre-line">
                {contentDisplay}
              </div>
              {entry.tags && <p className="text-gray-400 text-xs mt-4">Tags: {entry.tags}</p>}
              {links.length > 0 && showAutoLinks && (
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="text-xs text-gray-500">Linked:</span>
                  {links.slice(0, 5).map((link, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-0.5 rounded ${
                        link.type === 'character' ? 'bg-green-100 text-green-800' :
                        link.type === 'location' ? 'bg-blue-100 text-blue-800' :
                        'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {link.type}: {link.name}
                    </span>
                  ))}
                  {links.length > 5 && (
                    <span className="text-xs text-gray-500">+{links.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {lore.length === 0 && (
          <div className="col-span-full text-center py-12 bg-gray-100 rounded-lg">
            <p className="text-gray-500">No lore entries yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
