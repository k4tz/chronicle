// client/src/pages/Characters.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { charactersApi, Character } from '../api/api'

function errorDetail(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { details?: string; error?: string } } }
  return e?.response?.data?.details || e?.response?.data?.error || fallback
}

export default function CharactersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [characters, setCharacters] = useState<Character[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingChar, setEditingChar] = useState<Character | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null)
  const [genData, setGenData] = useState({ role: '', archetype: '', traits: '' })
  const [formData, setFormData] = useState<Partial<Character>>({
    name: '',
    aliases: '',
    appearance: '',
    background: '',
    personality: '',
    motivation: '',
    fears: '',
    secrets: '',
    abilities: '',
    flaws: '',
    speechPatterns: '',
  })

  useEffect(() => {
    loadCharacters()
  }, [projectId])

  const loadCharacters = () => {
    if (!projectId) return
    setLoading(true)
    charactersApi.list(projectId)
      .then(setCharacters)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return

    try {
      if (editingChar) {
        await charactersApi.update(projectId, editingChar.id, formData)
      } else {
        await charactersApi.create(projectId, formData)
      }
      setShowForm(false)
      setEditingChar(null)
      setFormData({
        name: '',
        aliases: '',
        appearance: '',
        background: '',
        personality: '',
        motivation: '',
        fears: '',
        secrets: '',
        abilities: '',
        flaws: '',
        speechPatterns: '',
      })
      loadCharacters()
    } catch (error) {
      console.error('Failed to save character:', error)
      alert('Failed to save character')
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setGenerating(true)
    setGenStatus(null)
    try {
      const { character } = await charactersApi.generate(projectId, genData)
      setGenData({ role: '', archetype: '', traits: '' })
      loadCharacters()
      setGenStatus({ kind: 'success', msg: `Generated "${character.name}".` })
    } catch (error) {
      console.error('Failed to generate character:', error)
      setGenStatus({ kind: 'error', msg: errorDetail(error, 'Generation failed. Is the model server reachable?') })
    } finally {
      setGenerating(false)
    }
  }

  const handleEdit = (char: Character) => {
    setEditingChar(char)
    setFormData({
      name: char.name,
      aliases: char.aliases || '',
      appearance: char.appearance || '',
      background: char.background || '',
      personality: char.personality || '',
      motivation: char.motivation || '',
      fears: char.fears || '',
      secrets: char.secrets || '',
      abilities: char.abilities || '',
      flaws: char.flaws || '',
      speechPatterns: char.speechPatterns || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this character?')) return

    try {
      await charactersApi.delete(projectId, id)
      loadCharacters()
    } catch (error) {
      console.error('Failed to delete character:', error)
      alert('Failed to delete character')
    }
  }

  if (loading) {
    return <div className="p-8">Loading characters...</div>
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Characters</h1>
        <div className="flex gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            ← Back to Project
          </button>
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            ✨ AI Generate
          </button>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setEditingChar(null)
              setFormData({ name: '', aliases: '', appearance: '', background: '', personality: '', motivation: '', fears: '', secrets: '', abilities: '', flaws: '', speechPatterns: '' })
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Character'}
          </button>
        </div>
      </div>

      {showGenerate && (
        <form onSubmit={handleGenerate} className="mb-8 bg-gray-800 p-6 rounded-lg border border-purple-500/40">
          <h2 className="text-lg font-semibold mb-3 text-gray-100">AI Character Generator</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Role *</label>
              <input type="text" value={genData.role} onChange={(e) => setGenData({ ...genData, role: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., The reluctant hero" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Archetype</label>
              <input type="text" value={genData.archetype} onChange={(e) => setGenData({ ...genData, archetype: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., The mentor" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Key Traits</label>
              <input type="text" value={genData.traits} onChange={(e) => setGenData({ ...genData, traits: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-gray-700 border-gray-600 text-gray-100" placeholder="e.g., Brave but impulsive" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className={`text-sm ${genStatus?.kind === 'error' ? 'text-red-400' : 'text-green-400'}`} aria-live="polite">
              {generating ? 'The model is writing a character — this can take a minute…' : genStatus?.msg || ''}
            </p>
            <button type="submit" disabled={generating || !genData.role}
              className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shrink-0">
              {generating ? 'Generating...' : 'Generate Character'}
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            {editingChar ? 'Edit Character' : 'New Character'}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
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
              <label className="block text-sm font-medium mb-1">Aliases</label>
              <input
                type="text"
                value={formData.aliases || ''}
                onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Appearance</label>
              <input
                type="text"
                value={formData.appearance || ''}
                onChange={(e) => setFormData({ ...formData, appearance: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Background</label>
            <textarea
              value={formData.background || ''}
              onChange={(e) => setFormData({ ...formData, background: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Personality</label>
              <textarea
                value={formData.personality || ''}
                onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Motivation</label>
              <textarea
                value={formData.motivation || ''}
                onChange={(e) => setFormData({ ...formData, motivation: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Fears</label>
              <textarea
                value={formData.fears || ''}
                onChange={(e) => setFormData({ ...formData, fears: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Secrets</label>
              <textarea
                value={formData.secrets || ''}
                onChange={(e) => setFormData({ ...formData, secrets: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Abilities</label>
              <textarea
                value={formData.abilities || ''}
                onChange={(e) => setFormData({ ...formData, abilities: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Flaws</label>
              <textarea
                value={formData.flaws || ''}
                onChange={(e) => setFormData({ ...formData, flaws: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Speech Patterns</label>
              <textarea
                value={formData.speechPatterns || ''}
                onChange={(e) => setFormData({ ...formData, speechPatterns: e.target.value })}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {editingChar ? 'Update' : 'Create'} Character
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {characters.map((char) => (
          <div key={char.id} className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold">{char.name}</h3>
            {char.aliases && (
              <p className="text-gray-500 text-sm">aka {char.aliases}</p>
            )}
            {char.appearance && (
              <p className="text-gray-600 mt-2 text-sm">{char.appearance}</p>
            )}
            {char.background && (
              <p className="text-gray-600 mt-2 text-sm line-clamp-2">{char.background}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleEdit(char)}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(char.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {characters.length === 0 && (
          <div className="col-span-full text-center py-12 bg-gray-100 rounded-lg">
            <p className="text-gray-500">No characters yet. Add one above!</p>
          </div>
        )}
      </div>
    </div>
  )
}
