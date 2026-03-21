// client/src/pages/Ideas.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ideasApi, charactersApi, locationsApi, loreApi, Idea, Character, Location, LoreEntry } from '../api/api'

type ViewMode = 'board' | 'list'
type ScopeMode = 'project' | 'global'

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
  const [scopeMode, setScopeMode] = useState<ScopeMode>('project')
  const [formData, setFormData] = useState<Partial<Idea> & { isGlobal?: boolean }>({
    title: '',
    description: '',
    category: '',
    linkedEntities: [],
    isGlobal: false,
    deviationFactor: 0,
  })

  useEffect(() => { loadAllData() }, [projectId, scopeMode])

  const loadAllData = () => {
    if (!projectId && scopeMode === 'project') return
    setLoading(true)
    
    const ideasPromise = scopeMode === 'project' && projectId
      ? ideasApi.list(projectId)
      : ideasApi.listGlobal()
    
    Promise.all([
      ideasPromise,
      charactersApi.list(projectId || ''),
      locationsApi.list(projectId || ''),
      loreApi.list(projectId || ''),
    ]).then(([ideasData, chars, locs, loreData]) => {
      setIdeas(ideasData)
      setCharacters(chars)
      setLocations(locs)
      setLore(loreData)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId && !formData.isGlobal) return
    try {
      if (editingIdea) {
        await ideasApi.update(projectId || '', editingIdea.id, formData)
      } else {
        await ideasApi.create(projectId || '', formData)
      }
      setShowForm(false)
      setEditingIdea(null)
      setFormData({ title: '', description: '', category: '', linkedEntities: [], isGlobal: scopeMode === 'global', deviationFactor: 0 })
      loadAllData()
    } catch (error) {
      console.error('Failed to save idea:', error)
      alert('Failed to save idea')
    }
  }

  const handleEdit = (idea: Idea) => {
    setEditingIdea(idea)
    setFormData({
      title: idea.title,
      description: idea.description || '',
      category: idea.category || '',
      linkedEntities: parseLinkedEntities(idea.linkedEntities),
      deviationFactor: idea.deviationFactor,
      isGlobal: !idea.projectId,
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this idea?')) return
    try { await ideasApi.delete(projectId, id); loadAllData() } catch { alert('Failed to delete') }
  }

  const handleToggleUsed = async (idea: Idea) => {
    try {
      await ideasApi.toggleUsed(idea.id)
      loadAllData()
    } catch (error) {
      console.error('Failed to toggle used status:', error)
    }
  }

  const handleDeviationChange = async (idea: Idea, value: number) => {
    try {
      await ideasApi.updateDeviation(idea.id, value)
      loadAllData()
    } catch (error) {
      console.error('Failed to update deviation:', error)
    }
  }

  const toggleLinkedEntity = (entityType: string, entityId: string) => {
    const current = parseLinkedEntities(formData.linkedEntities)
    const exists = current.find(e => e.entityId === entityId && e.entityType === entityType)
    if (exists) {
      setFormData({ ...formData, linkedEntities: current.filter(e => e.entityId !== entityId || e.entityType !== entityType) })
    } else {
      setFormData({ ...formData, linkedEntities: [...current, { entityId, entityType }] })
    }
  }

  const isLinked = (entityType: string, entityId: string) => {
    const current = parseLinkedEntities(formData.linkedEntities)
    return current.some(e => e.entityId === entityId && e.entityType === entityType)
  }

  const parseLinkedEntities = (entities: any): Array<{ entityId: string; entityType: string }> => {
    if (!entities) return []
    if (typeof entities === 'string') {
      try { return JSON.parse(entities) } catch { return [] }
    }
    return Array.isArray(entities) ? entities : []
  }

  const getLinkedNames = (idea: Idea) => {
    const names: string[] = []
    const entities = parseLinkedEntities(idea.linkedEntities)
    entities.forEach(e => {
      if (e.entityType === 'character') {
        const c = characters.find(ch => ch.id === e.entityId)
        if (c) names.push(`👤 ${c.name}`)
      } else if (e.entityType === 'location') {
        const l = locations.find(loc => loc.id === e.entityId)
        if (l) names.push(`📍 ${l.name}`)
      } else if (e.entityType === 'lore') {
        const loreEntry = lore.find(l => l.id === e.entityId)
        if (loreEntry) names.push(`📖 ${loreEntry.title}`)
      }
    })
    return names
  }

  const getInspirationHistory = (idea: Idea) => {
    if (!idea.inspirationFor || idea.inspirationFor.length === 0) return []
    return idea.inspirationFor.map(insp => ({
      ...insp,
      label: `${insp.type.charAt(0).toUpperCase() + insp.type.slice(1)}: ${insp.id.slice(0, 8)}...`,
    }))
  }

  const categories = ['plot', 'character', 'world', 'theme', 'scene', 'dialogue', 'location', 'cosmology', 'history', 'other']

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      plot: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      character: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      world: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      theme: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      scene: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      dialogue: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      location: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
      cosmology: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      history: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
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
          {/* Scope Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setScopeMode('project')}
              className={`px-4 py-2 text-sm font-medium transition ${
                scopeMode === 'project'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              📁 Project Ideas
            </button>
            <button
              onClick={() => setScopeMode('global')}
              className={`px-4 py-2 text-sm font-medium transition ${
                scopeMode === 'global'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              🌍 Global Ideas
            </button>
          </div>
          
          {/* View Mode Toggle */}
          <button
            onClick={() => setViewMode('board')}
            className={`px-4 py-2 rounded ${viewMode === 'board' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            List
          </button>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setEditingIdea(null)
              setFormData({ title: '', description: '', category: '', linkedEntities: [], isGlobal: scopeMode === 'global', deviationFactor: 0 })
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Idea'}
          </button>
        </div>
      </div>

      {/* Scope Info Banner */}
      <div className={`mb-6 p-4 rounded-lg ${
        scopeMode === 'global'
          ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
          : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
      }`}>
        <p className="text-sm">
          {scopeMode === 'global'
            ? '🌍 Global Ideas are available across all projects. Use these for universal concepts, themes, or ideas you want to reuse.'
            : '📁 Project Ideas are specific to this project. They will be used when generating content for this project.'}
        </p>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{editingIdea ? 'Edit Idea' : 'New Idea'} {formData.isGlobal && '🌍 (Global)'}</h2>
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

          {/* Deviation Factor */}
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">
              Deviation Factor: {formData.deviationFactor}%
              <span className="text-xs text-gray-500 ml-2">(How much creative freedom the LLM has)</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={formData.deviationFactor || 0}
              onChange={(e) => setFormData({ ...formData, deviationFactor: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Follow exactly</span>
              <span>Creative freedom</span>
            </div>
          </div>

          {/* Global Toggle */}
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="isGlobal"
              checked={formData.isGlobal || false}
              onChange={(e) => setFormData({ ...formData, isGlobal: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="isGlobal" className="text-sm font-medium">
              Make this a global idea (available across all projects)
            </label>
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
              <p className="text-gray-500 text-sm">Add characters, locations, or lore entries to link them to this idea.</p>
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
                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
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
                    onToggleUsed={handleToggleUsed}
                    onDeviationChange={handleDeviationChange}
                    getLinkedNames={getLinkedNames}
                    getInspirationHistory={getInspirationHistory}
                    categoryColor={getCategoryColor}
                  />
                ))}
                {ideasByCategory[category].length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-sm">No ideas</div>
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
              onToggleUsed={handleToggleUsed}
              onDeviationChange={handleDeviationChange}
              getLinkedNames={getLinkedNames}
              getInspirationHistory={getInspirationHistory}
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
  onToggleUsed: (idea: Idea) => void
  onDeviationChange: (idea: Idea, value: number) => void
  getLinkedNames: (idea: Idea) => string[]
  getInspirationHistory: (idea: Idea) => Array<{ type: string; id: string; createdAt: string; label: string }>
  categoryColor: (cat: string) => string
}

function IdeaCard({ idea, onEdit, onDelete, onToggleUsed, onDeviationChange, getLinkedNames, getInspirationHistory, categoryColor }: IdeaCardProps) {
  const linkedNames = getLinkedNames(idea)
  const inspirationHistory = getInspirationHistory(idea)

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
      
      {/* Used Status */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => onToggleUsed(idea)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${
            idea.isUsed
              ? 'bg-green-600 text-white'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900'
          }`}
        >
          {idea.isUsed ? '✓ Used' : '○ Unused'}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Reused {idea.reuseCount} time{idea.reuseCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Deviation Factor */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500 dark:text-gray-400">Deviation</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{idea.deviationFactor}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="10"
          value={idea.deviationFactor}
          onChange={(e) => onDeviationChange(idea, parseInt(e.target.value))}
          className="w-full h-1"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Linked Entities */}
      {linkedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {linkedNames.map((name, i) => (
            <span key={i} className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Inspiration History */}
      {inspirationHistory.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Inspired:</p>
          <div className="flex flex-wrap gap-1">
            {inspirationHistory.slice(0, 5).map((insp, i) => (
              <span key={i} className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                {insp.label}
              </span>
            ))}
            {inspirationHistory.length > 5 && (
              <span className="text-xs text-gray-500">+{inspirationHistory.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
