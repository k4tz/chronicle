// client/src/pages/ChapterEditor.tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  chaptersApi, charactersApi, locationsApi, styleProfilesApi, generationApi,
  Chapter, Character, Location, StyleProfileRecord,
  CharacterState, LocationState, OpenThread, ChapterStages, PipelineStage
} from '../api/api'
import GenerationPanel from '../components/GenerationPanel'
import NovelEditor, { EntityRef } from '../components/NovelEditor'

type Stage = 'OUTLINE' | 'DRAFT' | 'FINAL'
const STAGE_TABS: { stage: Stage; label: string }[] = [
  { stage: 'OUTLINE', label: 'Outline' },
  { stage: 'DRAFT', label: 'Draft' },
  { stage: 'FINAL', label: 'Final' },
]
const toStage = (s: PipelineStage): Stage => s.toUpperCase() as Stage

export default function ChapterEditorPage() {
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [stages, setStages] = useState<ChapterStages>({ OUTLINE: null, DRAFT: null, FINAL: null })
  const [currentStage, setCurrentStage] = useState<Stage>('DRAFT')
  const [characters, setCharacters] = useState<Character[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [styleProfiles, setStyleProfiles] = useState<StyleProfileRecord[]>([])

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  // Autosave: debounced background save so navigating away never loses work.
  const [autoStatus, setAutoStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const dirtyRef = useRef(false)               // true only after a real user edit
  const savedContentRef = useRef('')           // last content persisted to the server
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSnapshot, setShowSnapshot] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  // Lightweight, non-blocking toast (replaces alert()).
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }
  // C1: distraction-free focus mode + in-editor find/replace.
  const [focusMode, setFocusMode] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')

  const findCount = findText ? content.split(findText).length - 1 : 0
  const replaceAll = () => {
    if (!findText) return
    dirtyRef.current = true
    setContent(prev => prev.split(findText).join(replaceText))
    showToast(`Replaced ${findCount} occurrence${findCount === 1 ? '' : 's'}`)
  }

  // Known entities for inline hovercards in the editor.
  const entityRefs = useMemo<EntityRef[]>(() => [
    ...characters.map(c => ({ name: c.name, type: 'Character', detail: (c.motivation || c.personality || c.background || '').slice(0, 140) || undefined })),
    ...locations.map(l => ({ name: l.name, type: 'Location', detail: (l.description || l.atmosphere || '').slice(0, 140) || undefined })),
  ], [characters, locations])

  const onEditorChange = (v: string) => { dirtyRef.current = true; setContent(v) }

  // Snapshot form state
  const [charStates, setCharStates] = useState<Record<string, CharacterState>>({})
  const [locStates, setLocStates] = useState<Record<string, LocationState>>({})
  const [threadStates, setThreadStates] = useState<Record<string, OpenThread>>({})
  const [newCanonFacts, setNewCanonFacts] = useState('')
  const [worldChanges, setWorldChanges] = useState('')

  // B1: AI auto-fill of the snapshot with confidence. Manual editing stays the
  // source of truth — the AI just pre-fills and flags the uncertain items.
  const [autoFilling, setAutoFilling] = useState(false)
  const [overallConfidence, setOverallConfidence] = useState<number | null>(null)
  const [charConfidence, setCharConfidence] = useState<Record<string, number>>({})
  const [locConfidence, setLocConfidence] = useState<Record<string, number>>({})
  const LOW_CONFIDENCE = 70

  useEffect(() => { loadAllData() }, [projectId, chapterId])

  const loadAllData = (preferredStage?: Stage) => {
    if (!projectId || !chapterId) return
    setLoading(true)
    Promise.all([
      chaptersApi.get(projectId, chapterId),
      charactersApi.list(projectId),
      locationsApi.list(projectId),
      styleProfilesApi.list(projectId),
    ]).then(([chapterData, chars, locs, profiles]) => {
      setChapter(chapterData.chapter)
      setStyleProfiles(profiles)

      // Load the most-advanced stage that has content (Final → Draft → Outline),
      // honouring an explicit preference (e.g. the stage just generated/edited).
      const st = chapterData.stages || { OUTLINE: null, DRAFT: null, FINAL: null }
      setStages(st)
      const order: Stage[] = ['FINAL', 'DRAFT', 'OUTLINE']
      const pick: Stage = (preferredStage && st[preferredStage]) ? preferredStage : (order.find(s => st[s]) || 'OUTLINE')
      setCurrentStage(pick)
      const loaded = st[pick]?.content ?? ''
      setContent(loaded)
      // Loaded content is already persisted — start clean so we don't autosave it.
      savedContentRef.current = loaded
      dirtyRef.current = false
      setAutoStatus('idle')

      setCharacters(chars)
      setLocations(locs)

      // Initialize snapshot form with existing data or defaults. AI-finalized
      // snapshots key states by characterName/locationName (no id), so resolve
      // names → ids here; manually-saved snapshots already carry the id.
      if (chapterData.snapshot) {
        const charById = new Map(chars.map((c: Character) => [c.name.toLowerCase(), c.id]))
        const locById = new Map(locs.map((l: Location) => [l.name.toLowerCase(), l.id]))

        const cs: Record<string, CharacterState> = {}
        chapterData.snapshot.characterStates.forEach((s: CharacterState & { characterName?: string }) => {
          const id = s.charId || charById.get(String(s.characterName || '').toLowerCase())
          if (!id) return
          cs[id] = { charId: id, location: s.location || '', condition: s.condition || 'normal', emotionalState: s.emotionalState || '', activeGoals: s.activeGoals || [], newKnowledge: s.newKnowledge || [] }
        })
        setCharStates(cs)

        const ls: Record<string, LocationState> = {}
        chapterData.snapshot.locationStates.forEach((s: LocationState & { locationName?: string }) => {
          const id = s.locationId || locById.get(String(s.locationName || '').toLowerCase())
          if (!id) return
          ls[id] = { locationId: id, currentOccupants: s.currentOccupants || [], condition: s.condition || '', activeEvents: s.activeEvents || [] }
        })
        setLocStates(ls)

        const ts: Record<string, OpenThread> = {}
        chapterData.snapshot.openThreads.forEach((s: OpenThread) => {
          const id = s.threadId || `ai:${s.name}`
          ts[id] = { threadId: id, name: s.name, urgency: (s.urgency as 1 | 2 | 3) || 2, lastDevelopment: s.lastDevelopment || '' }
        })
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

  // Debounced autosave — fires ~2.5s after the user stops typing, only when the
  // content actually changed since the last persisted version.
  useEffect(() => {
    if (!dirtyRef.current) return
    if (content === savedContentRef.current) return
    setAutoStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void autoSave() }, 2500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Autosave writes back to whichever stage is currently loaded, so editing the
  // Outline updates the Outline version (not a separate MANUAL row).
  const autoSave = async () => {
    if (!projectId || !chapterId) return
    if (content === savedContentRef.current) return
    setAutoStatus('saving')
    try {
      await chaptersApi.saveVersion(projectId, chapterId, content, currentStage)
      savedContentRef.current = content
      dirtyRef.current = false
      setLastSavedAt(new Date())
      setAutoStatus('saved')
    } catch (error) {
      console.error('Autosave failed:', error)
      setAutoStatus('error')
    }
  }

  const handleSave = async () => {
    if (!projectId || !chapterId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaving(true)
    try {
      await chaptersApi.saveVersion(projectId, chapterId, content, currentStage)
      savedContentRef.current = content
      dirtyRef.current = false
      setLastSavedAt(new Date())
      setAutoStatus('saved')
      loadAllData(currentStage)
    } catch (error) {
      console.error('Failed to save:', error)
      setAutoStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Finalize: extract the state snapshot, evolve the Knowledge Bank with the
  // confident updates, and advance arc plot points. (This is the post-chapter
  // hook that the Arc Planner relies on — previously unreachable from the UI.)
  const handleFinalize = async () => {
    if (!projectId || !chapterId) return
    setFinalizing(true)
    showToast('Finalizing — analysing the chapter…')
    try {
      const res = await generationApi.finalizeChapter(projectId, chapterId, characters.map(c => c.id), locations.map(l => l.id))
      const kb = res.kbEvolution ? ` · ${res.kbEvolution.applied} KB update${res.kbEvolution.applied === 1 ? '' : 's'}` : ''
      const arc = res.arcPlanner?.advisory ? ` · ${res.arcPlanner.advisory}` : ''
      showToast(`Finalized (~${res.confidence ?? 0}% confidence)${kb}${arc}`)
      loadAllData(currentStage)
    } catch (error) {
      console.error('Finalize failed:', error)
      showToast('Finalize failed — is the model server reachable?')
    } finally {
      setFinalizing(false)
    }
  }

  // Switch which saved stage is loaded into the editor for viewing/editing.
  const loadStage = (stage: Stage) => {
    const v = stages[stage]
    setContent(v?.content ?? '')
    setCurrentStage(stage)
    savedContentRef.current = v?.content ?? ''
    dirtyRef.current = false
    setAutoStatus('idle')
  }

  // Called by GenerationPanel as a stage streams and on completion. The server
  // already persisted each stage; reflect the text + active stage and refresh
  // stage/version metadata without clobbering the freshly generated content.
  const handleGenerated = async (newContent: string, stage: PipelineStage) => {
    setContent(newContent)
    setCurrentStage(toStage(stage))
    savedContentRef.current = newContent
    dirtyRef.current = false
    if (!projectId || !chapterId) return
    try {
      const data = await chaptersApi.get(projectId, chapterId)
      setChapter(data.chapter)
      setStages(data.stages)
    } catch (error) {
      console.error('Failed to refresh chapter after generation:', error)
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
      showToast('State snapshot saved')
      loadAllData()
    } catch (error) {
      console.error('Failed to save snapshot:', error)
      showToast('Failed to save snapshot')
    }
  }

  // B1: ask the AI to infer the snapshot from the chapter text, pre-fill the
  // form, and flag low-confidence items. The author still reviews/edits/saves.
  const handleAutoFill = async () => {
    if (!projectId || !chapterId) return
    setAutoFilling(true)
    try {
      const { analysis } = await generationApi.analyzeChapter(projectId, chapterId, content || undefined)

      const charByName = new Map(characters.map(c => [c.name.toLowerCase(), c]))
      const newCharConf: Record<string, number> = {}
      setCharStates(prev => {
        const next = { ...prev }
        for (const cs of analysis.characterStates) {
          const ch = charByName.get(String(cs.characterName || '').toLowerCase())
          if (!ch) continue
          next[ch.id] = {
            charId: ch.id,
            location: cs.location || '',
            condition: cs.condition || 'normal',
            emotionalState: cs.emotionalState || '',
            activeGoals: cs.activeGoals || [],
            newKnowledge: cs.newKnowledge || [],
          }
          if (typeof cs.confidence === 'number') newCharConf[ch.id] = cs.confidence
        }
        return next
      })
      setCharConfidence(newCharConf)

      const locByName = new Map(locations.map(l => [l.name.toLowerCase(), l]))
      const newLocConf: Record<string, number> = {}
      setLocStates(prev => {
        const next = { ...prev }
        for (const ls of analysis.locationStates) {
          const loc = locByName.get(String(ls.locationName || '').toLowerCase())
          if (!loc) continue
          next[loc.id] = {
            locationId: loc.id,
            currentOccupants: ls.currentOccupants || [],
            condition: ls.condition || '',
            activeEvents: ls.activeEvents || [],
          }
          if (typeof ls.confidence === 'number') newLocConf[loc.id] = ls.confidence
        }
        return next
      })
      setLocConfidence(newLocConf)

      // Inferred threads have no id yet — key them by a synthetic id so they show.
      setThreadStates(prev => {
        const next = { ...prev }
        for (const t of analysis.openThreads) {
          const id = `ai:${t.name}`
          next[id] = { threadId: id, name: t.name, urgency: (t.urgency as 1 | 2 | 3) || 2, lastDevelopment: t.lastDevelopment || '' }
        }
        return next
      })

      const mergeLines = (existing: string, lines: string[]) => {
        const have = new Set(existing.split('\n').map(s => s.trim()).filter(Boolean))
        const merged = [...have]
        for (const l of lines) { if (l.trim() && !have.has(l.trim())) merged.push(l.trim()) }
        return merged.join('\n')
      }
      if (analysis.newCanonFacts.length) setNewCanonFacts(prev => mergeLines(prev, analysis.newCanonFacts))
      if (analysis.worldChanges.length) setWorldChanges(prev => mergeLines(prev, analysis.worldChanges))

      setOverallConfidence(analysis.overallConfidence)
      showToast(`AI pre-filled the snapshot (~${analysis.overallConfidence}% confident). Review highlighted items, then Save.`)
    } catch (error) {
      console.error('Auto-fill failed:', error)
      showToast('AI auto-fill failed — fill the snapshot manually')
    } finally {
      setAutoFilling(false)
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
          <p className="text-xs mt-1 h-4" aria-live="polite">
            {autoStatus === 'saving' && <span className="text-gray-400">Saving…</span>}
            {autoStatus === 'saved' && <span className="text-green-600">Saved{lastSavedAt ? ` · ${lastSavedAt.toLocaleTimeString()}` : ''}</span>}
            {autoStatus === 'unsaved' && <span className="text-amber-600">Unsaved changes…</span>}
            {autoStatus === 'error' && <span className="text-red-600">Autosave failed — click Save</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/projects/${projectId}/chapters`)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            ← Back to Chapters
          </button>
          <button
            onClick={() => setShowFind(v => !v)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            🔍 Find
          </button>
          <button
            onClick={() => setFocusMode(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            title="Distraction-free writing"
          >
            🎯 Focus
          </button>
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            🤖 Generate
          </button>
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            📜 Stages
          </button>
          <button
            onClick={() => setShowSnapshot(!showSnapshot)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            📋 State Snapshot
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            title={`Save the ${currentStage.toLowerCase()} version`}
          >
            {saving ? 'Saving...' : `Save ${currentStage.charAt(0) + currentStage.slice(1).toLowerCase()}`}
          </button>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
            title="Extract the state snapshot, evolve the Knowledge Bank, and advance arc plot points"
          >
            {finalizing ? 'Finalizing…' : '✅ Finalize'}
          </button>
        </div>
      </div>

      {/* AI Generation Panel */}
      {showGenerate && (
        <div className="mb-6">
          <GenerationPanel
            projectId={projectId!}
            chapterId={chapterId!}
            styleProfiles={styleProfiles}
            defaultStyleProfileId={chapter.styleProfileId}
            existingStages={{ outline: !!stages.OUTLINE, draft: !!stages.DRAFT, final: !!stages.FINAL }}
            currentContent={content}
            onGenerate={handleGenerated}
          />
        </div>
      )}

      {/* Stage drawer — the 3 canonical versions (outline / draft / final) */}
      {showVersions && (
        <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Chapter Stages</h3>
          <div className="space-y-2">
            {STAGE_TABS.map(({ stage, label }) => {
              const v = stages[stage]
              return (
                <div key={stage} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
                    {v ? (
                      <>
                        <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{new Date(v.createdAt).toLocaleString()}</span>
                        <span className="text-gray-400 text-sm ml-2">{v.wordCount.toLocaleString()} words</span>
                      </>
                    ) : (
                      <span className="text-gray-400 text-sm ml-2">— not generated yet</span>
                    )}
                  </div>
                  <button
                    onClick={() => { loadStage(stage); setShowVersions(false) }}
                    disabled={!v}
                    className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-default"
                  >
                    Load
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* State Snapshot Drawer */}
      {showSnapshot && (
        <div className="mb-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-lg">State Snapshot - Chapter {chapter.number}</h3>
              {overallConfidence != null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  AI confidence ~{overallConfidence}% · amber = please confirm
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAutoFill}
                disabled={autoFilling}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                title="Let the AI infer this snapshot from the chapter; you confirm the uncertain bits"
              >
                {autoFilling ? 'Analyzing…' : '✨ Auto-fill from chapter (AI)'}
              </button>
              <button onClick={handleSaveSnapshot} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                Save Snapshot
              </button>
            </div>
          </div>

          {/* Character States */}
          <div>
            <h4 className="font-medium mb-3">Character States</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {characters.map(char => (
                <div key={char.id} className={`border rounded p-4 ${charConfidence[char.id] != null && charConfidence[char.id] < LOW_CONFIDENCE ? 'border-amber-400 ring-1 ring-amber-400' : 'dark:border-gray-700'}`}>
                  <p className="font-medium flex items-center gap-2">
                    {char.name}
                    {charConfidence[char.id] != null && charConfidence[char.id] < LOW_CONFIDENCE && (
                      <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">confirm ({charConfidence[char.id]}%)</span>
                    )}
                  </p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Location</label>
                      <select
                        value={charStates[char.id]?.location || ''}
                        onChange={(e) => updateCharState(char.id, 'location', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                <div key={loc.id} className={`border rounded p-4 ${locConfidence[loc.id] != null && locConfidence[loc.id] < LOW_CONFIDENCE ? 'border-amber-400 ring-1 ring-amber-400' : 'dark:border-gray-700'}`}>
                  <p className="font-medium flex items-center gap-2">
                    {loc.name}
                    {locConfidence[loc.id] != null && locConfidence[loc.id] < LOW_CONFIDENCE && (
                      <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">confirm ({locConfidence[loc.id]}%)</span>
                    )}
                  </p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Condition</label>
                      <input
                        type="text"
                        value={locStates[loc.id]?.condition || ''}
                        onChange={(e) => updateLocState(loc.id, 'condition', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                        placeholder="e.g., Intact, Damaged"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Active Events</label>
                      <input
                        type="text"
                        value={locStates[loc.id]?.activeEvents.join(', ') || ''}
                        onChange={(e) => updateLocState(loc.id, 'activeEvents', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                <div key={thread.threadId} className="border dark:border-gray-700 rounded p-4">
                  <p className="font-medium">{thread.name}</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Urgency</label>
                      <select
                        value={thread.urgency}
                        onChange={(e) => updateThreadState(thread.threadId, 'urgency', parseInt(e.target.value))}
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                        className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                rows={4}
                placeholder="One fact per line..."
              />
            </div>
            <div>
              <h4 className="font-medium mb-2">World Changes</h4>
              <textarea
                value={worldChanges}
                onChange={(e) => setWorldChanges(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                rows={4}
                placeholder="One change per line..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Find / Replace bar */}
      {showFind && (
        <div className="mb-3 flex flex-wrap items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-lg shadow">
          <input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find"
            className="px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          />
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with"
            className="px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          />
          <span className="text-xs text-gray-500">{findText ? `${findCount} match${findCount === 1 ? '' : 'es'}` : ''}</span>
          <button onClick={replaceAll} disabled={!findText || findCount === 0} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            Replace all
          </button>
          <button onClick={() => setShowFind(false)} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700">✕</button>
        </div>
      )}

      {/* Stage selector — load & edit any stage; regenerate from the Generate panel */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Editing stage:</span>
        {STAGE_TABS.map(({ stage, label }) => {
          const v = stages[stage]
          const active = currentStage === stage
          return (
            <button
              key={stage}
              onClick={() => loadStage(stage)}
              className={`px-3 py-1.5 rounded text-sm border transition ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={v ? `${v.wordCount.toLocaleString()} words` : 'Not generated yet'}
            >
              {label} <span className={active ? 'text-blue-100' : 'text-gray-400'}>{v ? `(${v.wordCount.toLocaleString()})` : '(empty)'}</span>
            </button>
          )
        })}
      </div>

      {/* Chapter Editor */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-2">
        <NovelEditor
          value={content}
          onChange={onEditorChange}
          entities={entityRefs}
          placeholder="Start writing your chapter..."
          height="600px"
        />
      </div>

      {/* Focus mode — distraction-free full-screen editor (autosave still runs) */}
      {focusMode && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              {chapter.title || `Chapter ${chapter.number}`} · {content.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words
              {autoStatus === 'saving' && ' · Saving…'}
              {autoStatus === 'saved' && ' · Saved'}
              {autoStatus === 'unsaved' && ' · Unsaved…'}
            </div>
            <button onClick={() => setFocusMode(false)} className="px-4 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-600">
              Exit focus (Esc)
            </button>
          </div>
          <div className="flex-1 overflow-auto w-full max-w-3xl mx-auto px-6 py-8" onKeyDown={(e) => { if (e.key === 'Escape') setFocusMode(false) }}>
            <NovelEditor
              autoFocus
              value={content}
              onChange={onEditorChange}
              entities={entityRefs}
              placeholder="Write…"
              height="100%"
            />
          </div>
        </div>
      )}

      {/* Word count */}
      <div className="mt-4 text-right text-gray-500 text-sm">
        {content.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg bg-gray-900 text-white text-sm" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
