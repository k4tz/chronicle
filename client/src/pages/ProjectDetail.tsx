// client/src/pages/ProjectDetail.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProject } from '../store/projects'
import { apiClient, projectsApi } from '../api/client'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetWordCount, setTargetWordCount] = useState<number>()
  const [editingSettings, setEditingSettings] = useState(false)
  const [settings, setSettings] = useState({
    recentChaptersCount: 3,
    minRecentChapters: 1,
    maxRecentChapters: 5,
    minWordCountPerChapter: 2000,
  })

  const { data: project, isLoading, error } = useProject(id ?? null)

  if (isLoading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">Project Not Found</h1>
        <p className="text-gray-500 dark:text-gray-400">The project you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Projects
        </button>
      </div>
    )
  }

  const { project: proj, world, arc } = project

  const handleSaveTargetWordCount = async () => {
    if (!id || !targetWordCount) return
    try {
      await apiClient.put(`/projects/${id}`, { targetWordCount })
      setEditingTarget(false)
      window.location.reload() // Refresh to get updated data
    } catch (error) {
      console.error('Failed to update target word count:', error)
      alert('Failed to update target word count')
    }
  }

  const handleSaveSettings = async () => {
    if (!id) return
    
    // Validate settings
    if (settings.minRecentChapters > settings.maxRecentChapters) {
      alert('Minimum recent chapters cannot exceed maximum')
      return
    }
    if (settings.recentChaptersCount < settings.minRecentChapters || 
        settings.recentChaptersCount > settings.maxRecentChapters) {
      alert('Recent chapters count must be between min and max values')
      return
    }
    
    try {
      await projectsApi.updateSettings(id, settings)
      setEditingSettings(false)
      window.location.reload()
    } catch (error) {
      console.error('Failed to update settings:', error)
      alert('Failed to update settings')
    }
  }

  const wordCountPercentage = Math.round((proj.currentWordCount / proj.targetWordCount) * 100)
  
  // Get current settings from project
  const currentSettings = {
    recentChaptersCount: proj.recentChaptersCount ?? 3,
    minRecentChapters: proj.minRecentChapters ?? 1,
    maxRecentChapters: proj.maxRecentChapters ?? 5,
    minWordCountPerChapter: proj.minWordCountPerChapter ?? 2000,
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{proj.title}</h1>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          ← Back to Projects
        </button>
      </div>

      {/* Word Count Progress */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Word Count Progress</h2>
          <div className="text-2xl font-bold text-blue-600">{wordCountPercentage}%</div>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 mb-4">
          <div
            className={`h-6 rounded-full transition-all ${
              wordCountPercentage >= 100 ? 'bg-green-600' : 'bg-blue-600'
            }`}
            style={{ width: `${Math.min(wordCountPercentage, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-gray-600 dark:text-gray-400">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{proj.currentWordCount.toLocaleString()}</span>
            <span className="mx-2">/</span>
            {editingTarget ? (
              <div className="inline-flex items-center gap-2">
                <input
                  type="number"
                  value={targetWordCount ?? proj.targetWordCount}
                  onChange={(e) => setTargetWordCount(parseInt(e.target.value) || 0)}
                  className="w-32 px-3 py-1 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Target"
                />
                <button onClick={handleSaveTargetWordCount} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Save</button>
                <button onClick={() => setEditingTarget(false)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm">Cancel</button>
              </div>
            ) : (
              <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:underline" onClick={() => { setTargetWordCount(proj.targetWordCount); setEditingTarget(true) }}>
                {proj.targetWordCount.toLocaleString()}
              </span>
            )}
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">(click to edit)</span>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {(proj.targetWordCount - proj.currentWordCount).toLocaleString()} words remaining
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Project Information</h2>

        {proj.logline && (
          <p className="mb-4 text-gray-600 dark:text-gray-400">{proj.logline}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Genre</span>
            <p className="text-gray-900 dark:text-gray-100">{proj.genre || 'Not set'}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Tone</span>
            <p className="text-gray-900 dark:text-gray-100">{proj.tone || 'Not set'}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">POV</span>
            <p className="text-gray-900 dark:text-gray-100">{proj.pov}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Content Rating</span>
            <p className="text-gray-900 dark:text-gray-100">{proj.contentRating}</p>
          </div>
        </div>
      </div>

      {/* Snapshot/Recency Settings */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Chapter Generation Settings</h2>
          {!editingSettings ? (
            <button
              onClick={() => {
                setSettings(currentSettings)
                setEditingSettings(true)
              }}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Edit Settings
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleSaveSettings} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Save</button>
              <button onClick={() => setEditingSettings(false)} className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">Cancel</button>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Control how many recent chapters are included in the context when generating new chapters. 
          This affects story continuity and token usage.
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Recent Chapters
              <span className="block text-xs text-gray-500 dark:text-gray-400">Default count</span>
            </label>
            {editingSettings ? (
              <input
                type="number"
                min="1"
                max="20"
                value={settings.recentChaptersCount}
                onChange={(e) => setSettings({ ...settings, recentChaptersCount: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              />
            ) : (
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentSettings.recentChaptersCount}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Minimum
              <span className="block text-xs text-gray-500 dark:text-gray-400">Min: 1, Max: 10</span>
            </label>
            {editingSettings ? (
              <input
                type="number"
                min="1"
                max="10"
                value={settings.minRecentChapters}
                onChange={(e) => setSettings({ ...settings, minRecentChapters: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              />
            ) : (
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentSettings.minRecentChapters}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Maximum
              <span className="block text-xs text-gray-500 dark:text-gray-400">Min: 1, Max: 20</span>
            </label>
            {editingSettings ? (
              <input
                type="number"
                min="1"
                max="20"
                value={settings.maxRecentChapters}
                onChange={(e) => setSettings({ ...settings, maxRecentChapters: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              />
            ) : (
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentSettings.maxRecentChapters}</p>
            )}
          </div>
        </div>

        {/* Min Word Count Per Chapter */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Chapter Word Count
            <span className="block text-xs text-gray-500 dark:text-gray-400">Used when generating chapters (500-10000)</span>
          </label>
          {editingSettings ? (
            <input
              type="number"
              min="500"
              max="10000"
              step="100"
              value={settings.minWordCountPerChapter}
              onChange={(e) => setSettings({ ...settings, minWordCountPerChapter: parseInt(e.target.value) || 2000 })}
              className="w-full md:w-1/3 px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            />
          ) : (
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentSettings.minWordCountPerChapter} words</p>
          )}
        </div>

        {editingSettings && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Validation Rules:</strong> Min must be 1-10, Max must be 1-20, Min ≤ Max, Recent Chapters must be between Min and Max, and Word Count must be 500-10000.
            </p>
          </div>
        )}
      </div>

      {/* World Foundation */}
      {world && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">World Foundation</h2>

          {world.cosmology && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Cosmology</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.cosmology}</p>
            </div>
          )}

          {world.history && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">History</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.history}</p>
            </div>
          )}

          {world.geography && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Geography</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.geography}</p>
            </div>
          )}

          {world.politicalLandscape && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Political Landscape</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.politicalLandscape}</p>
            </div>
          )}

          {world.economy && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Economy</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.economy}</p>
            </div>
          )}

          {world.culture && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Culture</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.culture}</p>
            </div>
          )}

          {world.magicOrTechRules && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Magic/Tech Rules</h3>
              <p className="text-gray-600 dark:text-gray-400">{world.magicOrTechRules}</p>
            </div>
          )}
        </div>
      )}

      {/* Story Arc */}
      {arc && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Story Arc</h2>

          <div className="mb-4">
            <p className="font-medium text-gray-900 dark:text-gray-100">{arc.name}</p>
            {arc.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{arc.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            <span className={`px-2 py-1 rounded text-sm ${
              arc.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
              arc.status === 'resolved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {arc.status}
            </span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate(`/projects/${id}/chapters`)}
          className="px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 text-center"
        >
          <span className="block text-lg font-semibold">Chapters</span>
          <span className="text-sm opacity-80">Write & Manage</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/world`)}
          className="px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center"
        >
          <span className="block text-lg font-semibold">World</span>
          <span className="text-sm opacity-80">Foundation</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/characters`)}
          className="px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center"
        >
          <span className="block text-lg font-semibold">Characters</span>
          <span className="text-sm opacity-80">Cast & Relations</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/locations`)}
          className="px-6 py-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-center"
        >
          <span className="block text-lg font-semibold">Locations</span>
          <span className="text-sm opacity-80">Places</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/lore`)}
          className="px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-center"
        >
          <span className="block text-lg font-semibold">Lore</span>
          <span className="text-sm opacity-80">Entries</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/arcs`)}
          className="px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center"
        >
          <span className="block text-lg font-semibold">Arcs</span>
          <span className="text-sm opacity-80">Story Arcs</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/threads`)}
          className="px-6 py-4 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-center"
        >
          <span className="block text-lg font-semibold">Threads</span>
          <span className="text-sm opacity-80">Plot Threads</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/foreshadowing`)}
          className="px-6 py-4 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-center"
        >
          <span className="block text-lg font-semibold">Foreshadowing</span>
          <span className="text-sm opacity-80">Ledger</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/ideas`)}
          className="px-6 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-center"
        >
          <span className="block text-lg font-semibold">Ideas</span>
          <span className="text-sm opacity-80">Brainstorm</span>
        </button>

        <button
          onClick={() => navigate(`/projects/${id}/style-profiles`)}
          className="px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-center"
        >
          <span className="block text-lg font-semibold">Style</span>
          <span className="text-sm opacity-80">Profiles</span>
        </button>
      </div>
    </div>
  )
}
