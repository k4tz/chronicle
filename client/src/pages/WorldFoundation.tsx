// client/src/pages/WorldFoundation.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { worldApi, WorldFoundation } from '../api/api'
import { apiClient } from '../api/client'

export default function WorldFoundationPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [seedInput, setSeedInput] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [world, setWorld] = useState<Partial<WorldFoundation>>({
    cosmology: '',
    history: '',
    geography: '',
    politicalLandscape: '',
    economy: '',
    culture: '',
    magicOrTechRules: '',
  })

  useEffect(() => {
    if (!projectId) return

    worldApi.get(projectId)
      .then((data) => {
        if (data) {
          setWorld({
            cosmology: data.cosmology || '',
            history: data.history || '',
            geography: data.geography || '',
            politicalLandscape: data.politicalLandscape || '',
            economy: data.economy || '',
            culture: data.culture || '',
            magicOrTechRules: data.magicOrTechRules || '',
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

  const handleSave = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      await worldApi.update(projectId, world)
      alert('World foundation saved!')
    } catch (error) {
      console.error('Failed to save world:', error)
      alert('Failed to save world foundation')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (!projectId || !seedInput) return
    setGenerating(true)
    try {
      const response = await apiClient.post(`/projects/${projectId}/generate/world`, { seed: seedInput })
      if (response.data.success) {
        setWorld({
          cosmology: response.data.world.cosmology || '',
          history: response.data.world.history || '',
          geography: response.data.world.geography || '',
          politicalLandscape: response.data.world.politicalLandscape || '',
          economy: response.data.world.economy || '',
          culture: response.data.world.culture || '',
          magicOrTechRules: response.data.world.magicOrTechRules || '',
        })
        setShowGenerate(false)
        setSeedInput('')
        alert('World generated successfully!')
      }
    } catch (error) {
      console.error('Failed to generate world:', error)
      alert('Failed to generate world. Make sure Ollama is running.')
    } finally {
      setGenerating(false)
    }
  }

  const handleChange = (field: keyof WorldFoundation) => (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setWorld((prev) => ({ ...prev, [field]: e.target.value }))
  }

  if (loading) {
    return <div className="p-8">Loading world foundation...</div>
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">World Foundation</h1>
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
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save World'}
          </button>
        </div>
      </div>

      {showGenerate && (
        <div className="mb-8 bg-purple-50 p-6 rounded-lg border border-purple-200">
          <h2 className="text-lg font-semibold mb-3">AI World Generator</h2>
          <p className="text-gray-600 mb-4">Enter a seed concept and the AI will generate a complete world foundation for you.</p>
          <div className="flex gap-4">
            <input
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="e.g., A world where magic is powered by emotions, but negative emotions create dangerous wild magic"
              className="flex-1 px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !seedInput.trim()}
              className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Section
          title="Cosmology"
          description="The structure of your world's universe, planes of existence, creation myths"
          value={world.cosmology || ''}
          onChange={handleChange('cosmology')}
        />

        <Section
          title="History"
          description="Major historical events, eras, civilizations, and turning points"
          value={world.history || ''}
          onChange={handleChange('history')}
        />

        <Section
          title="Geography"
          description="Continents, regions, climate zones, natural features"
          value={world.geography || ''}
          onChange={handleChange('geography')}
        />

        <Section
          title="Political Landscape"
          description="Nations, governments, power structures, conflicts"
          value={world.politicalLandscape || ''}
          onChange={handleChange('politicalLandscape')}
        />

        <Section
          title="Economy"
          description="Trade, currency, resources, industries, economic systems"
          value={world.economy || ''}
          onChange={handleChange('economy')}
        />

        <Section
          title="Culture"
          description="Social norms, traditions, art, religion, daily life"
          value={world.culture || ''}
          onChange={handleChange('culture')}
        />

        <Section
          title="Magic/Tech Rules"
          description="Rules governing magic systems or advanced technology"
          value={world.magicOrTechRules || ''}
          onChange={handleChange('magicOrTechRules')}
        />
      </div>
    </div>
  )
}

interface SectionProps {
  title: string
  description: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

function Section({ title, description, value, onChange }: SectionProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      <textarea
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={6}
        placeholder={`Enter ${title.toLowerCase()}...`}
      />
    </div>
  )
}
