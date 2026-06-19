// client/src/pages/ArcPlanner.tsx
//
// Arc Planner — the consolidated planning surface (REBUILD-PLAN §E2). Replaces
// the standalone Story Arcs / Plot Threads / Foreshadowing pages with one
// hierarchical canvas: Major Arc → Sub-Arc → Plot Points / Characters / Lore /
// Foreshadowing. The structured data here feeds the chapter-generation pipeline.
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  arcPlannerApi, charactersApi, loreApi,
  MajorArcWithSubs, MajorArc, SubArc, PlotPoint, PlotPointType, ForeshadowingSeed,
  Character, LoreEntry, CharacterRef, CharacterInvolvement, LoreRef, MigrationStatus,
} from '../api/api'

const PLOT_TYPES: PlotPointType[] = ['event', 'revelation', 'confrontation', 'turning_point', 'quiet_beat']
const PROGRESSIONS = ['setup', 'rising', 'climax', 'resolution'] as const
const ROLES = ['protagonist', 'antagonist', 'supporting', 'background'] as const
const PRESENCE = ['central', 'active', 'peripheral', 'absent'] as const

// --- tiny field helpers (keep the editor readable) ---------------------------
const inputCls = 'w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600'
const labelCls = 'block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300'

function Field({ label, value, onChange, textarea, rows, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number; placeholder?: string
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {textarea
        ? <textarea className={inputCls} rows={rows || 2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}

// Comma-separated string ↔ string[] tag editor.
function TagField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <Field
      label={label}
      placeholder={placeholder}
      value={value.join(', ')}
      onChange={(v) => onChange(v.split(',').map(s => s.trim()).filter(Boolean))}
    />
  )
}

function Btn({ children, onClick, disabled, variant = 'primary', title, className = '' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'ghost' | 'danger' | 'ai'; title?: string; className?: string
}) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    ghost: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
    danger: 'text-red-600 hover:underline',
    ai: 'bg-purple-600 text-white hover:bg-purple-700',
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`px-3 py-1.5 rounded text-sm disabled:opacity-50 ${styles} ${className}`}>{children}</button>
  )
}

export default function ArcPlannerPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [arcs, setArcs] = useState<MajorArcWithSubs[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'sub_arcs'>('overview')
  const [characters, setCharacters] = useState<Character[]>([])
  const [lore, setLore] = useState<LoreEntry[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [migration, setMigration] = useState<MigrationStatus | null>(null)

  const flash = (m: string) => { setStatus(m); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setStatus(''), 4000) }

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [a, c, l, m] = await Promise.all([
        arcPlannerApi.listMajorArcs(projectId),
        charactersApi.list(projectId),
        loreApi.list(projectId),
        arcPlannerApi.migrationStatus(projectId).catch(() => null),
      ])
      setArcs(a)
      setCharacters(c)
      setLore(l)
      setMigration(m)
      if (a.length && !a.find(x => x.id === selectedArcId)) setSelectedArcId(a[0].id)
    } catch (e) {
      console.error(e); flash('Failed to load arc planner')
    } finally {
      setLoading(false)
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const selectedArc = arcs.find(a => a.id === selectedArcId) || null
  const selectedSub = selectedArc?.subArcs.find(s => s.id === selectedSubId) || null

  // --- major arc actions -----------------------------------------------------
  const createArc = async (data?: Partial<MajorArc>) => {
    if (!projectId) return
    const lastEnd = arcs.reduce((m, a) => Math.max(m, a.chapterEnd), 0)
    const created = await arcPlannerApi.createMajorArc(projectId, {
      title: data?.title || `Arc ${arcs.length + 1}`,
      chapterStart: lastEnd + 1,
      chapterEnd: lastEnd + 20,
      ...data,
    })
    await load()
    setSelectedArcId(created.id)
    setTab('overview')
  }

  const generateArc = async () => {
    if (!projectId) return
    setBusy(true); flash('Generating arc with AI…')
    try {
      const lastEnd = arcs.reduce((m, a) => Math.max(m, a.chapterEnd), 0)
      const { arc } = await arcPlannerApi.generateMajorArc(projectId, { chapterStart: lastEnd + 1, chapterEnd: lastEnd + 20 })
      await createArc({ ...arc, chapterStart: lastEnd + 1, chapterEnd: lastEnd + 20, generatedByLlm: true })
      flash('AI arc drafted — review and save')
    } catch (e) {
      console.error(e); flash('AI arc generation failed (is the model running?)')
    } finally { setBusy(false) }
  }

  const deleteArc = async (id: string) => {
    if (!projectId || !confirm('Delete this major arc and all its sub-arcs?')) return
    await arcPlannerApi.deleteMajorArc(projectId, id)
    if (selectedArcId === id) setSelectedArcId(null)
    await load()
  }

  const runMigration = async () => {
    if (!projectId) return
    setBusy(true); flash('Migrating legacy arcs / threads / foreshadowing…')
    try {
      const { created } = await arcPlannerApi.migrate(projectId)
      flash(`Migrated ${created.arcs} arcs, ${created.subArcs} sub-arcs, ${created.plotPoints} plot points, ${created.seeds} seeds`)
      await load()
    } catch (e) {
      console.error(e); flash('Migration failed')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-8 text-gray-600 dark:text-gray-300">Loading arc planner…</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Arc Planner</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Plan arcs &amp; sub-arcs — this structure steers chapter generation.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ai" onClick={generateArc} disabled={busy} title="Draft a new arc with the local model">✨ Generate Arc</Btn>
          <Btn onClick={() => createArc()} disabled={busy}>+ New Major Arc</Btn>
        </div>
      </div>

      {migration?.canMigrate && arcs.length === 0 && (
        <div className="mb-4 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 flex items-center justify-between">
          <div className="text-sm text-amber-800 dark:text-amber-200">
            Found legacy data ({migration.legacy.arcs} arcs, {migration.legacy.threads} threads, {migration.legacy.foreshadowing} foreshadowing).
            Import it into the Arc Planner?
          </div>
          <Btn onClick={runMigration} disabled={busy}>Migrate</Btn>
        </div>
      )}

      {status && <div className="mb-4 p-2 rounded bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">{status}</div>}

      {arcs.length === 0 ? (
        <div className="text-center py-16 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400 mb-3">No arcs yet. Create one, or let AI draft a first arc.</p>
          <Btn onClick={() => createArc()}>+ New Major Arc</Btn>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* Major arc list */}
          <aside className="space-y-2">
            {arcs.map((a) => (
              <button key={a.id} onClick={() => { setSelectedArcId(a.id); setSelectedSubId(null) }}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  a.id === selectedArcId
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
                }`}>
                <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{a.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Ch {a.chapterStart}–{a.chapterEnd} · {a.subArcs.length} sub-arcs</div>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                  a.status === 'in_progress' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                  a.status === 'completed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}>{a.status.replace('_', ' ')}</span>
              </button>
            ))}
          </aside>

          {/* Detail panel */}
          {selectedArc ? (
            <section className="min-w-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                  {(['overview', 'sub_arcs'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                        tab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400'
                      }`}>
                      {t === 'overview' ? 'Arc Overview' : `Sub-Arcs (${selectedArc.subArcs.length})`}
                    </button>
                  ))}
                </div>
                <Btn variant="danger" onClick={() => deleteArc(selectedArc.id)}>Delete arc</Btn>
              </div>

              {tab === 'overview' ? (
                <ArcOverview
                  key={selectedArc.id}
                  projectId={projectId!}
                  arc={selectedArc}
                  characters={characters}
                  lore={lore}
                  onSaved={load}
                  flash={flash}
                  busy={busy}
                  setBusy={setBusy}
                />
              ) : (
                <SubArcsTab
                  key={selectedArc.id}
                  projectId={projectId!}
                  arc={selectedArc}
                  characters={characters}
                  lore={lore}
                  selectedSubId={selectedSubId}
                  setSelectedSubId={setSelectedSubId}
                  selectedSub={selectedSub}
                  onChanged={load}
                  flash={flash}
                  busy={busy}
                  setBusy={setBusy}
                />
              )}
            </section>
          ) : (
            <div className="text-gray-500 dark:text-gray-400">Select an arc.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Arc Overview tab
// ============================================================================
function ArcOverview({ projectId, arc, characters, lore, onSaved, flash, busy, setBusy }: {
  projectId: string; arc: MajorArcWithSubs; characters: Character[]; lore: LoreEntry[]
  onSaved: () => Promise<void>; flash: (m: string) => void; busy: boolean; setBusy: (b: boolean) => void
}) {
  const [form, setForm] = useState<MajorArc>(arc)
  useEffect(() => { setForm(arc) }, [arc])
  const set = <K extends keyof MajorArc>(k: K, v: MajorArc[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true)
    try { await arcPlannerApi.updateMajorArc(projectId, arc.id, form); await onSaved(); flash('Arc saved') }
    catch { flash('Failed to save arc') } finally { setBusy(false) }
  }

  const toggleCharacter = (c: Character) => {
    const exists = form.characters.find(x => x.characterId === c.id)
    if (exists) set('characters', form.characters.filter(x => x.characterId !== c.id))
    else set('characters', [...form.characters, { characterId: c.id, name: c.name, role: 'supporting' } as CharacterRef])
  }
  const setRole = (id: string, role: CharacterRef['role']) =>
    set('characters', form.characters.map(x => x.characterId === id ? { ...x, role } : x))

  const suggestForeshadowing = async () => {
    setBusy(true); flash('Suggesting foreshadowing…')
    try {
      const { seeds } = await arcPlannerApi.suggestForeshadowing(projectId, arc.id)
      set('foreshadowingSeeds', [...form.foreshadowingSeeds, ...seeds])
      flash(`Added ${seeds.length} foreshadowing seeds — review & save`)
    } catch { flash('Foreshadowing suggestion failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5 bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title" value={form.title} onChange={v => set('title', v)} />
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Ch. start</label>
            <input type="number" className={inputCls} value={form.chapterStart} onChange={e => set('chapterStart', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className={labelCls}>Ch. end</label>
            <input type="number" className={inputCls} value={form.chapterEnd} onChange={e => set('chapterEnd', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as MajorArc['status'])}>
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      <Field label="Central conflict" value={form.centralConflict || ''} onChange={v => set('centralConflict', v)} textarea placeholder="The core tension this arc explores" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Arc goal (resolve by end)" value={form.arcGoal || ''} onChange={v => set('arcGoal', v)} textarea />
        <Field label="Closing state (target endpoint)" value={form.closingState || ''} onChange={v => set('closingState', v)} textarea />
        <Field label="Opening state" value={form.openingState || ''} onChange={v => set('openingState', v)} textarea />
        <div className="space-y-4">
          <TagField label="Tone keywords" value={form.toneKeywords} onChange={v => set('toneKeywords', v)} placeholder="tension, mystery, betrayal" />
          <TagField label="Themes" value={form.themes} onChange={v => set('themes', v)} placeholder="sacrifice, found family" />
        </div>
      </div>

      {/* Characters */}
      <div>
        <label className={labelCls}>Characters in this arc</label>
        <div className="flex flex-wrap gap-2">
          {characters.length === 0 && <span className="text-sm text-gray-400">No characters yet — add some in the Characters page.</span>}
          {characters.map(c => {
            const sel = form.characters.find(x => x.characterId === c.id)
            return (
              <div key={c.id} className={`px-2 py-1 rounded border text-sm flex items-center gap-2 ${sel ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
                <button onClick={() => toggleCharacter(c)} className="text-gray-900 dark:text-gray-100">{sel ? '✓ ' : '+ '}{c.name}</button>
                {sel && (
                  <select className="text-xs bg-transparent border rounded dark:border-gray-600" value={sel.role} onChange={e => setRole(c.id, e.target.value as CharacterRef['role'])}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Lore */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LoreMultiSelect label="Lore introduced" lore={lore} value={form.loreIntroduced} onChange={v => set('loreIntroduced', v)} />
        <LoreMultiSelect label="Lore developed" lore={lore} value={form.loreDeveloped} onChange={v => set('loreDeveloped', v)} />
      </div>

      {/* Foreshadowing seeds */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Foreshadowing seeds</label>
          <Btn variant="ai" onClick={suggestForeshadowing} disabled={busy}>✨ Suggest</Btn>
        </div>
        <SeedEditor seeds={form.foreshadowingSeeds} onChange={v => set('foreshadowingSeeds', v)} />
      </div>

      <div className="flex justify-end">
        <Btn onClick={save} disabled={busy}>Save arc</Btn>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-Arcs tab
// ============================================================================
function SubArcsTab({ projectId, arc, characters, lore, selectedSubId, setSelectedSubId, selectedSub, onChanged, flash, busy, setBusy }: {
  projectId: string; arc: MajorArcWithSubs; characters: Character[]; lore: LoreEntry[]
  selectedSubId: string | null; setSelectedSubId: (id: string | null) => void; selectedSub: SubArc | null
  onChanged: () => Promise<void>; flash: (m: string) => void; busy: boolean; setBusy: (b: boolean) => void
}) {
  const createSub = async (data?: Partial<SubArc>) => {
    const lastEnd = arc.subArcs.reduce((m, s) => Math.max(m, s.chapterEnd), arc.chapterStart - 1)
    const start = Math.max(arc.chapterStart, lastEnd + 1)
    const created = await arcPlannerApi.createSubArc(projectId, arc.id, {
      title: data?.title || `Sub-Arc ${arc.subArcs.length + 1}`,
      chapterStart: start,
      chapterEnd: Math.min(arc.chapterEnd, start + 5),
      ...data,
    })
    await onChanged()
    setSelectedSubId(created.id)
  }

  const generateSub = async () => {
    setBusy(true); flash('Generating sub-arc with AI…')
    try {
      const lastEnd = arc.subArcs.reduce((m, s) => Math.max(m, s.chapterEnd), arc.chapterStart - 1)
      const start = Math.max(arc.chapterStart, lastEnd + 1)
      const { subArc } = await arcPlannerApi.generateSubArc(projectId, arc.id, { chapterStart: start, chapterEnd: Math.min(arc.chapterEnd, start + 5) })
      await createSub({ ...subArc, chapterStart: start, chapterEnd: Math.min(arc.chapterEnd, start + 5), generatedByLlm: true })
      flash('AI sub-arc drafted — review & save')
    } catch { flash('AI sub-arc generation failed') } finally { setBusy(false) }
  }

  return (
    <div>
      {/* Timeline of sub-arc cards */}
      <div className="flex items-center gap-3 overflow-x-auto pb-3 mb-4">
        {arc.subArcs.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button onClick={() => setSelectedSubId(s.id)}
              className={`min-w-[150px] text-left p-3 rounded-lg border ${
                s.id === selectedSubId ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}>
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{s.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Ch {s.chapterStart}–{s.chapterEnd}</div>
              <div className="text-[10px] uppercase mt-1 text-gray-400">{s.plotProgression}</div>
              {s.plotPoints.length > 0 && (
                <div className="text-[10px] text-gray-500 mt-1">
                  {s.plotPoints.filter(p => p.status === 'completed').length}/{s.plotPoints.length} beats done
                </div>
              )}
            </button>
            {i < arc.subArcs.length - 1 && <span className="text-gray-300 dark:text-gray-600 px-1">→</span>}
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Btn onClick={() => createSub()} disabled={busy}>+ Sub-Arc</Btn>
          <Btn variant="ai" onClick={generateSub} disabled={busy}>✨ Generate</Btn>
        </div>
      </div>

      {selectedSub ? (
        <SubArcEditor
          key={selectedSub.id}
          projectId={projectId}
          arc={arc}
          sub={selectedSub}
          characters={characters}
          lore={lore}
          onChanged={onChanged}
          flash={flash}
          busy={busy}
          setBusy={setBusy}
          onDeleted={() => { setSelectedSubId(null); onChanged() }}
        />
      ) : (
        <div className="text-sm text-gray-500 dark:text-gray-400">Select or create a sub-arc to edit its plot points, characters, lore and foreshadowing.</div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-Arc editor
// ============================================================================
function SubArcEditor({ projectId, arc, sub, characters, lore, onChanged, flash, busy, setBusy, onDeleted }: {
  projectId: string; arc: MajorArcWithSubs; sub: SubArc; characters: Character[]; lore: LoreEntry[]
  onChanged: () => Promise<void>; flash: (m: string) => void; busy: boolean; setBusy: (b: boolean) => void; onDeleted: () => void
}) {
  const [form, setForm] = useState<SubArc>(sub)
  const [subTab, setSubTab] = useState<'characters' | 'plot_points' | 'lore' | 'foreshadowing'>('plot_points')
  useEffect(() => { setForm(sub) }, [sub])
  const set = <K extends keyof SubArc>(k: K, v: SubArc[K]) => setForm(f => ({ ...f, [k]: v }))

  // Characters available in this sub-arc are the parent arc's selection.
  const poolIds = new Set(arc.characters.map(c => c.characterId))
  const pool = characters.filter(c => poolIds.has(c.id))

  const save = async () => {
    setBusy(true)
    try { await arcPlannerApi.updateSubArc(projectId, arc.id, sub.id, form); await onChanged(); flash('Sub-arc saved') }
    catch { flash('Failed to save sub-arc') } finally { setBusy(false) }
  }
  const del = async () => {
    if (!confirm('Delete this sub-arc?')) return
    setBusy(true)
    try { await arcPlannerApi.deleteSubArc(projectId, arc.id, sub.id); onDeleted() }
    finally { setBusy(false) }
  }

  const suggestPlot = async () => {
    setBusy(true); flash('Suggesting plot points…')
    try {
      const { plotPoints } = await arcPlannerApi.suggestPlotPoints(projectId, arc.id, sub.id)
      set('plotPoints', [...form.plotPoints, ...plotPoints])
      flash(`Added ${plotPoints.length} plot points — review & save`)
    } catch { flash('Plot point suggestion failed') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <Field label="Title" value={form.title} onChange={v => set('title', v)} />
        <div>
          <label className={labelCls}>Ch. start</label>
          <input type="number" className={inputCls + ' w-24'} value={form.chapterStart} onChange={e => set('chapterStart', parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label className={labelCls}>Ch. end</label>
          <input type="number" className={inputCls + ' w-24'} value={form.chapterEnd} onChange={e => set('chapterEnd', parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label className={labelCls}>Progression</label>
          <select className={inputCls} value={form.plotProgression} onChange={e => set('plotProgression', e.target.value as SubArc['plotProgression'])}>
            {PROGRESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <Field label="Emotional arc" value={form.emotionalArc || ''} onChange={v => set('emotionalArc', v)} placeholder="hope → dread → reluctant resolve" />

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['plot_points', 'characters', 'lore', 'foreshadowing'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${subTab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}>
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {subTab === 'plot_points' && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">Ordered story beats. Completed automatically as chapters finalize.</span>
            <div className="flex gap-2">
              <Btn variant="ai" onClick={suggestPlot} disabled={busy}>✨ Suggest</Btn>
              <Btn variant="ghost" onClick={() => set('plotPoints', [...form.plotPoints, { id: crypto.randomUUID(), orderIndex: form.plotPoints.length, label: '', type: 'event', chaptersAffected: [], linkedCharacters: [], linkedLore: [], status: 'pending' }])}>+ Add</Btn>
            </div>
          </div>
          {form.plotPoints.map((p, i) => (
            <PlotPointRow key={p.id} point={p}
              onChange={(np) => set('plotPoints', form.plotPoints.map((x, xi) => xi === i ? np : x))}
              onRemove={() => set('plotPoints', form.plotPoints.filter((_, xi) => xi !== i))} />
          ))}
          {form.plotPoints.length === 0 && <p className="text-sm text-gray-400">No plot points yet.</p>}
        </div>
      )}

      {subTab === 'characters' && (
        <div className="space-y-3">
          {pool.length === 0 && <p className="text-sm text-gray-400">Add characters to the parent arc first (Arc Overview tab).</p>}
          {pool.map(c => {
            const inv = form.charactersInvolved.find(x => x.characterId === c.id)
            return (
              <div key={c.id} className="border rounded p-3 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                  <select className="text-sm bg-transparent border rounded dark:border-gray-600 px-2 py-1"
                    value={inv?.presenceLevel || 'absent'}
                    onChange={e => {
                      const presenceLevel = e.target.value as CharacterInvolvement['presenceLevel']
                      if (presenceLevel === 'absent') set('charactersInvolved', form.charactersInvolved.filter(x => x.characterId !== c.id))
                      else if (inv) set('charactersInvolved', form.charactersInvolved.map(x => x.characterId === c.id ? { ...x, presenceLevel } : x))
                      else set('charactersInvolved', [...form.charactersInvolved, { characterId: c.id, name: c.name, presenceLevel, arcGoal: '', arcFear: '' }])
                    }}>
                    {PRESENCE.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {inv && inv.presenceLevel !== 'absent' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input className={inputCls} placeholder="Goal in this sub-arc" value={inv.arcGoal}
                      onChange={e => set('charactersInvolved', form.charactersInvolved.map(x => x.characterId === c.id ? { ...x, arcGoal: e.target.value } : x))} />
                    <input className={inputCls} placeholder="Fear / what they avoid" value={inv.arcFear}
                      onChange={e => set('charactersInvolved', form.charactersInvolved.map(x => x.characterId === c.id ? { ...x, arcFear: e.target.value } : x))} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {subTab === 'lore' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LoreMultiSelect label="Introduced" lore={lore} value={form.loreIntroduced} onChange={v => set('loreIntroduced', v)} />
          <LoreMultiSelect label="Developed" lore={lore} value={form.loreDeveloped} onChange={v => set('loreDeveloped', v)} />
          <LoreMultiSelect label="Revealed" lore={lore} value={form.loreRevealed} onChange={v => set('loreRevealed', v)} />
        </div>
      )}

      {subTab === 'foreshadowing' && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Seeds planted in this sub-arc</label>
            <SeedEditor seeds={form.foreshadowingPlanted} onChange={v => set('foreshadowingPlanted', v)} />
          </div>
          <div>
            <label className={labelCls}>Payoffs due in this sub-arc (from arc seeds)</label>
            {arc.foreshadowingSeeds.length === 0 && <p className="text-sm text-gray-400">No arc-level seeds. Add some in the Arc Overview.</p>}
            {arc.foreshadowingSeeds.map(seed => {
              const payoff = form.foreshadowingPayoffs.find(p => p.seedId === seed.id)
              return (
                <label key={seed.id} className="flex items-center gap-2 text-sm py-1 text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={!!payoff}
                    onChange={e => {
                      if (e.target.checked) set('foreshadowingPayoffs', [...form.foreshadowingPayoffs, { seedId: seed.id, hint: seed.hint, payoffType: seed.payoffType, status: 'pending' }])
                      else set('foreshadowingPayoffs', form.foreshadowingPayoffs.filter(p => p.seedId !== seed.id))
                    }} />
                  <span className="flex-1">{seed.hint}</span>
                  {payoff && (
                    <button className="text-xs text-blue-600 hover:underline"
                      onClick={() => set('foreshadowingPayoffs', form.foreshadowingPayoffs.map(p => p.seedId === seed.id ? { ...p, status: p.status === 'paid_off' ? 'pending' : 'paid_off' } : p))}>
                      {payoff.status === 'paid_off' ? '✓ paid off' : 'mark paid off'}
                    </button>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      <Field label="Pacing notes" value={form.pacingNotes || ''} onChange={v => set('pacingNotes', v)} textarea />
      <TagField label="Unresolved threads (carried forward)" value={form.unresolvedThreads} onChange={v => set('unresolvedThreads', v)} />

      {form.closureSummary && (
        <div className="text-xs bg-gray-50 dark:bg-gray-900/40 border dark:border-gray-700 rounded p-3 text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Closure summary (auto):</span> {form.closureSummary}
        </div>
      )}

      <div className="flex justify-between">
        <Btn variant="danger" onClick={del} disabled={busy}>Delete sub-arc</Btn>
        <Btn onClick={save} disabled={busy}>Save sub-arc</Btn>
      </div>
    </div>
  )
}

// --- shared sub-components ---------------------------------------------------
function PlotPointRow({ point, onChange, onRemove }: { point: PlotPoint; onChange: (p: PlotPoint) => void; onRemove: () => void }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded border dark:border-gray-700 ${point.status === 'completed' ? 'opacity-70 bg-green-50 dark:bg-green-900/10' : ''}`}>
      <button title="Toggle completed" onClick={() => onChange({ ...point, status: point.status === 'completed' ? 'pending' : 'completed' })}
        className={`w-5 h-5 rounded-full border flex-shrink-0 ${point.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-400'}`}>
        {point.status === 'completed' ? '✓' : ''}
      </button>
      <input className={inputCls + ' flex-1'} placeholder="What happens" value={point.label} onChange={e => onChange({ ...point, label: e.target.value })} />
      <select className="text-sm bg-transparent border rounded dark:border-gray-600 px-2 py-2" value={point.type} onChange={e => onChange({ ...point, type: e.target.value as PlotPointType })}>
        {PLOT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
      </select>
      <input className={inputCls + ' w-28'} placeholder="ch. 3, 4" value={point.chaptersAffected.join(', ')}
        onChange={e => onChange({ ...point, chaptersAffected: e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) })} />
      <button onClick={onRemove} className="text-red-500 hover:text-red-600 px-1">✕</button>
    </div>
  )
}

function SeedEditor({ seeds, onChange }: { seeds: ForeshadowingSeed[]; onChange: (s: ForeshadowingSeed[]) => void }) {
  const add = () => onChange([...seeds, { id: crypto.randomUUID(), hint: '', payoffInSubArc: null, payoffType: 'direct', status: 'planted' }])
  return (
    <div className="space-y-2">
      {seeds.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <input className={inputCls + ' flex-1'} placeholder="The seed the reader notices" value={s.hint}
            onChange={e => onChange(seeds.map((x, xi) => xi === i ? { ...x, hint: e.target.value } : x))} />
          <select className="text-sm bg-transparent border rounded dark:border-gray-600 px-2 py-2" value={s.payoffType}
            onChange={e => onChange(seeds.map((x, xi) => xi === i ? { ...x, payoffType: e.target.value as ForeshadowingSeed['payoffType'] } : x))}>
            <option value="direct">direct</option>
            <option value="inverted">inverted</option>
            <option value="thematic">thematic</option>
          </select>
          <select className="text-sm bg-transparent border rounded dark:border-gray-600 px-2 py-2" value={s.status}
            onChange={e => onChange(seeds.map((x, xi) => xi === i ? { ...x, status: e.target.value as ForeshadowingSeed['status'] } : x))}>
            <option value="planted">planted</option>
            <option value="reinforced">reinforced</option>
            <option value="paid_off">paid off</option>
          </select>
          <button onClick={() => onChange(seeds.filter((_, xi) => xi !== i))} className="text-red-500 hover:text-red-600 px-1">✕</button>
        </div>
      ))}
      <button onClick={add} className="text-sm text-blue-600 hover:underline">+ Add seed</button>
    </div>
  )
}

function LoreMultiSelect({ label, lore, value, onChange }: { label: string; lore: LoreEntry[]; value: LoreRef[]; onChange: (v: LoreRef[]) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 border rounded dark:border-gray-700">
        {lore.length === 0 && <span className="text-xs text-gray-400">No lore entries.</span>}
        {lore.map(l => {
          const sel = value.find(x => x.loreId === l.id)
          return (
            <button key={l.id} onClick={() => sel ? onChange(value.filter(x => x.loreId !== l.id)) : onChange([...value, { loreId: l.id, name: l.title, category: l.category }])}
              className={`px-2 py-0.5 rounded text-xs border ${sel ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
              {sel ? '✓ ' : ''}{l.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}
