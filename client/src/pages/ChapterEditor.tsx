// client/src/pages/ChapterEditor.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  chaptersApi, charactersApi, locationsApi,
  Chapter, ChapterVersion, Character, Location,
  CharacterState, LocationState, OpenThread
} from '../api/api'

export default function ChapterEditorPage() {
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [versions, setVersions] = useState<ChapterVersion[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSnapshot, setShowSnapshot] = useState(false)
  const [showVersions, setShowVersions] = useState(false)

  // Snapshot form state
  const [charStates, setCharStates] = useState<Record<string, CharacterState>>({})
  const [locStates, setLocStates] = useState<Record<string, LocationState>>({})
  const [threadStates, setThreadStates] = useState<Record<string, OpenThread>>({})
  const [newCanonFacts, setNewCanonFacts] = useState('')
  const [worldChanges, setWorldChanges] = useState('')

  useEffect(() => { loadAllData() }, [projectId, chapterId])

  const loadAllData = () => {
    if (!projectId || !chapterId) return
    setLoading(true)
    Promise.all([
      chaptersApi.get(projectId, chapterId),
      charactersApi.list(projectId),
      locationsApi.list(projectId),
    ]).then(([chapterData, chars, locs]) => {
      setChapter(chapterData.chapter)
      setVersions(chapterData.versions)

      // Get latest version content
      if (chapterData.versions.length > 0) {
        setContent(chapterData.versions[chapterData.versions.length - 1].content)
      } else {
        setContent('')
      }

      setCharacters(chars)
      setLocations(locs)

      // Initialize snapshot form with existing data or defaults
      if (chapterData.snapshot) {
        const cs: Record<string, CharacterState> = {}
        chapterData.snapshot.characterStates.forEach((s: CharacterState) => { cs[s.charId] = s })
        setCharStates(cs)

        const ls: Record<string, LocationState> = {}
        chapterData.snapshot.locationStates.forEach((s: LocationState) => { ls[s.locationId] = s })
        setLocStates(ls)

        const ts: Record<string, OpenThread> = {}
        chapterData.snapshot.openThreads.forEach((s: OpenThread) => { ts[s.threadId] = s })
        setThreadStates(ts)

        setNewCanonFacts(chapterData.snapshot.newCanonFacts.join('\n'))
        setWorldChanges(chapterData.snapshot.worldChanges.join('\n'))
      } else {
        // Initialize with defaults
        const defaultCharStates: Record<string, CharacterState> = {}
        chars.forEach((c: Character) => {
          defaultCharStates[c.id] = {
            charId: c.id,
            location: '',
            condition: 'normal',
            emotionalState: '',
            activeGoals: [],
            newKnowledge: [],
          }
        })
        setCharStates(defaultCharStates)

        const defaultLocStates: Record<string, LocationState> = {}
        locs.forEach((l: Location) => {
          defaultLocStates[l.id] = {
            locationId: l.id,
            currentOccupants: [],
            condition: 'normal',
            activeEvents: [],
          }
        })
        setLocStates(defaultLocStates)

        const defaultThreadStates: Record<string, OpenThread> = {}
        setThreadStates(defaultThreadStates)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSave = async (passType: 'DRAFT' | 'MANUAL' | 'FINAL') => {
    if (!projectId || !chapterId) return
    setSaving(true)
    try {
      await chaptersApi.saveVersion(projectId, chapterId, content, passType)
      alert('Chapter saved!')
      loadAllData()
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save chapter')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSnapshot = async () => {
    if (!projectId || !chapterId) return
    try {
      const snapshotData = {
        characterStates: Object.values(charStates),
        locationStates: Object.values(locStates),
        openThreads: Object.values(threadStates),
        newCanonFacts: newCanonFacts.split('\n').filter(l => l.trim()),
        worldChanges: worldChanges.split('\n').filter(l => l.trim()),
      }
      await chaptersApi.saveSnapshot(projectId, chapterId, snapshotData)
      setShowSnapshot(false)
      alert('State snapshot saved!')
      loadAllData()
    } catch (error) {
      console.error('Failed to save snapshot:', error)
      alert('Failed to save snapshot')
    }
  }

  const updateCharState = (charId: string, field: keyof CharacterState, value: any) => {
    setCharStates(prev => ({
      ...prev,
      [charId]: { ...prev[charId], [field]: value },
    }))
  }

  const updateLocState = (locId: string, field: keyof LocationState, value: any) => {
    setLocStates(prev => ({
      ...prev,
      [locId]: { ...prev[locId], [field]: value },
    }))
  }

  const updateThreadState = (threadId: string, field: keyof OpenThread, value: any) => {
    setThreadStates(prev => ({
      ...prev,
      [threadId]: { ...prev[threadId], [field]: value },
    }))
  }

  const loadVersion = (version: ChapterVersion) => {
    setContent(version.content)
    setShowVersions(false)
  }

  if (loading || !chapter) return <div className="p-8">Loading chapter...</div>

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{chapter.title || `Chapter ${chapter.number}`}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Status: <span className="capitalize">{chapter.status}</span> • {chapter.wordCount.toLocaleString()} words
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/projects/${projectId}/chapters`)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            ← Back to Chapters
          </button>
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            📜 Versions ({versions.length})
          </button>
          <button
            onClick={() => setShowSnapshot(!showSnapshot)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            📋 State Snapshot
          </button>
          <button
            onClick={() => handleSave('MANUAL')}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Version History Drawer */}
      {showVersions && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Chapter Versions</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{v.passType}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                  <span className="text-gray-400 text-sm ml-2">{v.wordCount} words</span>
                </div>
                <button
                  onClick={() => loadVersion(v)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Load
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State Snapshot Drawer */}
      {showSnapshot && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">State Snapshot - Chapter {chapter.number}</h3>
            <button onClick={handleSaveSnapshot} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
              Save Snapshot
            </button>
          </div>

          {/* Character States */}
          <div>
            <h4 className="font-medium mb-3">Character States</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {characters.map(char => (
                <div key={char.id} className="border rounded p-4">
                  <p className="font-medium">{char.name}</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Location</label>
                      <select
                        value={charStates[char.id]?.location || ''}
                        onChange={(e) => updateCharState(char.id, 'location', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="">Unknown</option>
                        {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Condition</label>
                      <select
                        value={charStates[char.id]?.condition || 'normal'}
                        onChange={(e) => updateCharState(char.id, 'condition', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="normal">Normal</option>
                        <option value="injured">Injured</option>
                        <option value="exhausted">Exhausted</option>
                        <option value="empowered">Empowered</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Emotional State</label>
                      <input
                        type="text"
                        value={charStates[char.id]?.emotionalState || ''}
                        onChange={(e) => updateCharState(char.id, 'emotionalState', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="e.g., Anxious, Determined"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Location States */}
          <div>
            <h4 className="font-medium mb-3">Location States</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {locations.map(loc => (
                <div key={loc.id} className="border rounded p-4">
                  <p className="font-medium">{loc.name}</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Condition</label>
                      <input
                        type="text"
                        value={locStates[loc.id]?.condition || ''}
                        onChange={(e) => updateLocState(loc.id, 'condition', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="e.g., Intact, Damaged"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Active Events</label>
                      <input
                        type="text"
                        value={locStates[loc.id]?.activeEvents.join(', ') || ''}
                        onChange={(e) => updateLocState(loc.id, 'activeEvents', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="e.g., Battle, Celebration"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plot Threads */}
          <div>
            <h4 className="font-medium mb-3">Active Plot Threads</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {Object.values(threadStates).map(thread => (
                <div key={thread.threadId} className="border rounded p-4">
                  <p className="font-medium">{thread.name}</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Urgency</label>
                      <select
                        value={thread.urgency}
                        onChange={(e) => updateThreadState(thread.threadId, 'urgency', parseInt(e.target.value))}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value={1}>Low</option>
                        <option value={2}>Medium</option>
                        <option value={3}>Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Last Development</label>
                      <input
                        type="text"
                        value={thread.lastDevelopment}
                        onChange={(e) => updateThreadState(thread.threadId, 'lastDevelopment', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="Brief update"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Canon Facts & World Changes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">New Canon Facts</h4>
              <textarea
                value={newCanonFacts}
                onChange={(e) => setNewCanonFacts(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                rows={4}
                placeholder="One fact per line..."
              />
            </div>
            <div>
              <h4 className="font-medium mb-2">World Changes</h4>
              <textarea
                value={worldChanges}
                onChange={(e) => setWorldChanges(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                rows={4}
                placeholder="One change per line..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Chapter Editor */}
      <div className="bg-white rounded-lg shadow">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing your chapter..."
          className="w-full h-[600px] px-6 py-4 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg resize-none font-serif text-lg leading-relaxed"
        />
      </div>

      {/* Word count */}
      <div className="mt-4 text-right text-gray-500 text-sm">
        {content.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words
      </div>
    </div>
  )
}
