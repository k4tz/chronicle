// client/src/pages/Ideas.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ideasApi, charactersApi, locationsApi, loreApi, Idea, Character, Location, LoreEntry } from '../api/api'

type ViewMode = 'board' | 'list'

export default function IdeasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [lore, setLore] = useState<LoreEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [formData, setFormData] = useState<Partial<Idea>>({
    title: '',
    description: '',
    category: '',
    linkedEntities: [],
  })

  useEffect(() => { loadAllData() }, [projectId])

  const loadAllData = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      ideasApi.list(projectId),
      charactersApi.list(projectId),
      locationsApi.list(projectId),
      loreApi.list(projectId),
    ]).then(([ideasData, chars, locs, loreData]) => {
      setIdeas(ideasData)
      setCharacters(chars)
      setLocations(locs)
      setLore(loreData)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      if (editingIdea) {
        await ideasApi.update(projectId, editingIdea.id, formData)
      } else {
        await ideasApi.create(projectId, formData)
      }
      setShowForm(false)
      setEditingIdea(null)
      setFormData({ title: '', description: '', category: '', linkedEntities: [] })
      loadAllData()
    } catch (error) {
      console.error('Failed to save idea:', error)
      alert('Failed to save idea')
    }
  }

  const handleEdit = (idea: Idea) => {
    setEditingIdea(idea)
    
    // Parse linkedEntities if it's a string (from API)
    let entities: Array<{ entityId: string; entityType: string }> = []
    if (typeof idea.linkedEntities === 'string') {
      try {
        entities = JSON.parse(idea.linkedEntities)
      } catch {
        entities = []
      }
    } else if (Array.isArray(idea.linkedEntities)) {
      entities = idea.linkedEntities
    }
    
    setFormData({
      title: idea.title,
      description: idea.description || '',
      category: idea.category || '',
      linkedEntities: entities,
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this idea?')) return
    try { await ideasApi.delete(projectId, id); loadAllData() } catch { alert('Failed to delete') }
  }

  const toggleLinkedEntity = (entityType: string, entityId: string) => {
    // Parse linkedEntities if it's a string
    let current: Array<{ entityId: string; entityType: string }> = []
    if (typeof formData.linkedEntities === 'string') {
      try {
        current = JSON.parse(formData.linkedEntities)
      } catch {
        current = []
      }
    } else if (Array.isArray(formData.linkedEntities)) {
      current = formData.linkedEntities
    }
    
    const exists = current.find(e => e.entityId === entityId && e.entityType === entityType)
    if (exists) {
      setFormData({ ...formData, linkedEntities: current.filter(e => e.entityId !== entityId || e.entityType !== entityType) })
    } else {
      setFormData({ ...formData, linkedEntities: [...current, { entityId, entityType }] })
    }
  }

  const isLinked = (entityType: string, entityId: string) => {
    // Parse linkedEntities if it's a string
    let entities: Array<{ entityId: string; entityType: string }> = []
    if (typeof formData.linkedEntities === 'string') {
      try {
        entities = JSON.parse(formData.linkedEntities)
      } catch {
        return false
      }
    } else if (Array.isArray(formData.linkedEntities)) {
      entities = formData.linkedEntities
    }
    
    return entities.some(e => e.entityId === entityId && e.entityType === entityType)
  }

  const getLinkedNames = (idea: Idea) => {
    const names: string[] = []

    // Parse linkedEntities if it's a string (from API)
    let entities: Array<{ entityId: string; entityType: string }> = []
    if (typeof idea.linkedEntities === 'string') {
      try {
        entities = JSON.parse(idea.linkedEntities)
      } catch {
        return names
      }
    } else if (Array.isArray(idea.linkedEntities)) {
      entities = idea.linkedEntities
    }

    entities.forEach(e => {
      if (e.entityType === 'character') {
        const c = characters.find(ch => ch.id === e.entityId)
        if (c) names.push(`👤 ${c.name}`)
      } else if (e.entityType === 'location') {
        const location = locations.find(l => l.id === e.entityId)
        if (location) names.push(`📍 ${location.name}`)
      } else if (e.entityType === 'lore') {
        const loreEntry = lore.find(l => l.id === e.entityId)
        if (loreEntry) names.push(`📖 ${loreEntry.title}`)
      }
    })
    return names
  }

  const categories = ['plot', 'character', 'world', 'theme', 'scene', 'dialogue', 'other']

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      plot: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      character: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      world: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      theme: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      scene: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      dialogue: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    }
    return colors[cat] || colors.other
  }

  const ideasByCategory = categories.reduce((acc, cat) => {
    acc[cat] = ideas.filter(i => i.category === cat)
    return acc
  }, {} as Record<string, Idea[]>)

  if (loading) return <div className="p-8">Loading ideas...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Idea Board</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('board')}
            className={`px-4 py-2 rounded ${viewMode === 'board' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            List
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingIdea(null); setFormData({ title: '', description: '', category: '', linkedEntities: [] }) }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Idea'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{editingIdea ? 'Edit Idea' : 'New Idea'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select category</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              rows={4}
            />
          </div>

          {/* Link to KB Elements */}
          <div className="mt-6">
            <h3 className="font-medium mb-3">Link to Story Elements</h3>

            {characters.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Characters</label>
                <div className="flex flex-wrap gap-2">
                  {characters.map(char => (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => toggleLinkedEntity('character', char.id)}
                      className={`px-3 py-1 rounded-full text-sm border ${
                        isLinked('character', char.id)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-green-500'
                      }`}
                    >
                      👤 {char.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {locations.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Locations</label>
                <div className="flex flex-wrap gap-2">
                  {locations.map(loc => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLinkedEntity('location', loc.id)}
                      className={`px-3 py-1 rounded-full text-sm border ${
                        isLinked('location', loc.id)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-500'
                      }`}
                    >
                      📍 {loc.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lore.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Lore Entries</label>
                <div className="flex flex-wrap gap-2">
                  {lore.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleLinkedEntity('lore', entry.id)}
                      className={`px-3 py-1 rounded-full text-sm border ${
                        isLinked('lore', entry.id)
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-500'
                      }`}
                    >
                      📖 {entry.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {characters.length === 0 && locations.length === 0 && lore.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Add characters, locations, or lore entries to link them to this idea.</p>
            )}
          </div>

          <div className="mt-6">
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {editingIdea ? 'Update' : 'Save'} Idea
            </button>
          </div>
        </form>
      )}

      {viewMode === 'board' ? (
        <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
          {categories.map(category => (
            <div key={category} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold capitalize">{category}</h3>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                  {ideasByCategory[category].length}
                </span>
              </div>
              <div className="space-y-3">
                {ideasByCategory[category].map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    getLinkedNames={getLinkedNames}
                    categoryColor={getCategoryColor}
                  />
                ))}
                {ideasByCategory[category].length === 0 && (
                  <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">No ideas</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onEdit={handleEdit}
              onDelete={handleDelete}
              getLinkedNames={getLinkedNames}
              categoryColor={getCategoryColor}
            />
          ))}
          {ideas.length === 0 && (
            <div className="col-span-full text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400">No ideas yet. Capture your inspiration above!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface IdeaCardProps {
  idea: Idea
  onEdit: (idea: Idea) => void
  onDelete: (id: string) => void
  getLinkedNames: (idea: Idea) => string[]
  categoryColor: (cat: string) => string
}

function IdeaCard({ idea, onEdit, onDelete, getLinkedNames, categoryColor }: IdeaCardProps) {
  const linkedNames = getLinkedNames(idea)

  return (
    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow hover:shadow-md transition">
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs px-2 py-1 rounded capitalize ${categoryColor(idea.category || 'other')}`}>
          {idea.category || 'uncategorized'}
        </span>
        <div className="flex gap-2">
          <button onClick={() => onEdit(idea)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
          <button onClick={() => onDelete(idea.id)} className="text-sm text-red-600 dark:text-red-400 hover:underline">Delete</button>
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-2">{idea.title}</h3>
      {idea.description && <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{idea.description}</p>}
      {linkedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {linkedNames.map((name, i) => (
            <span key={i} className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
