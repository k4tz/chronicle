// client/src/components/GenerationPanel.tsx
import { useState } from 'react'
import { generationApi, contextApi, AssembledContext, StyleProfileRecord, PipelineStage } from '../api/api'

// Reads an SSE byte stream, buffering across network chunks so a `data:` line
// split between reads is never parsed half-formed, and invokes `onEvent` per event.
async function consumeSSE(stream: ReadableStream<Uint8Array>, onEvent: (data: any) => void): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // keep the last, possibly-incomplete line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.replace(/^data:\s*/, '')
      if (!payload) continue
      try {
        onEvent(JSON.parse(payload))
      } catch {
        // ignore partial/non-JSON keepalive lines
      }
    }
  }
}

const STAGE_ORDER: PipelineStage[] = ['outline', 'draft', 'final']
const STAGE_LABEL: Record<PipelineStage, string> = { outline: 'Outline', draft: 'Draft', final: 'Final' }

interface GenerationPanelProps {
  projectId: string
  chapterId: string
  /** Reflects new text as a stage streams, plus the final content on completion. */
  onGenerate: (content: string, stage: PipelineStage) => void
  styleProfiles: StyleProfileRecord[]
  /** The chapter's saved style profile — used as the default so it isn't re-asked. */
  defaultStyleProfileId?: string | null
  /** Which stages already have saved content (drives reuse vs regenerate). */
  existingStages: { outline: boolean; draft: boolean; final: boolean }
  /** The chapter's current editor content — used for the continuity check. */
  currentContent: string
}

export default function GenerationPanel({
  projectId, chapterId, onGenerate, styleProfiles, defaultStyleProfileId, existingStages, currentContent,
}: GenerationPanelProps) {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [target, setTarget] = useState<PipelineStage>('final')
  const [selectedProfile, setSelectedProfile] = useState(defaultStyleProfileId || '')
  const [options, setOptions] = useState({ wordCount: 2000, tension: 5, focus: 'Balanced' })
  const [issues, setIssues] = useState<Array<{ type: string; severity: string; issue: string; suggestion?: string }>>([])
  // Context preview — lets the author see/steer what the model will actually be given.
  const [contextPreview, setContextPreview] = useState<AssembledContext | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)

  const handlePreviewContext = async () => {
    setLoadingContext(true)
    try {
      const ctx = await contextApi.getContext(projectId, { chapterId, q: currentContent.slice(0, 4000) || undefined })
      setContextPreview(ctx)
      setShowContext(true)
    } catch {
      setProgress('Failed to load context preview')
    } finally {
      setLoadingContext(false)
    }
  }

  // Stream the pipeline up to `to`, (re)generating from `from`. When `from` is
  // omitted the panel reuses existing earlier stages and only fills the rest.
  const runPipeline = async (to: PipelineStage, from?: PipelineStage) => {
    setGenerating(true)
    setIssues([])
    setProgress(`Starting ${STAGE_LABEL[to].toLowerCase()} generation…`)
    try {
      const stream = await generationApi.streamPipeline(projectId, chapterId, {
        target: to,
        from,
        wordCount: options.wordCount,
        tension: options.tension,
        focus: options.focus,
        styleProfileId: selectedProfile || undefined,
      })
      let active = ''
      await consumeSSE(stream, (data) => {
        if (data.type === 'stage-start') {
          active = ''
          setProgress(`Generating ${data.stage}…`)
        } else if (data.type === 'chunk') {
          active += data.content
          onGenerate(active, data.stage)
        } else if (data.type === 'reused') {
          setProgress(`Reusing existing ${data.stage}`)
        } else if (data.type === 'stage-complete') {
          setProgress(`${STAGE_LABEL[data.stage as PipelineStage]} done · ${data.wordCount?.toLocaleString?.() ?? ''} words`)
        } else if (data.type === 'complete') {
          onGenerate(data.content, data.stage)
          setProgress(`Done — ${STAGE_LABEL[data.stage as PipelineStage]} ready.`)
        } else if (data.type === 'error') {
          setProgress('Generation failed')
        }
      })
    } catch {
      setProgress('Generation failed — is the model server reachable?')
    } finally {
      setGenerating(false)
    }
  }

  // Primary action: fill any missing stages up to the target; if everything up
  // to the target already exists, regenerate just the target stage.
  const handleGenerate = () => {
    const exists = { outline: existingStages.outline, draft: existingStages.draft, final: existingStages.final }
    const tIdx = STAGE_ORDER.indexOf(target)
    let from: PipelineStage = target
    for (let i = 0; i <= tIdx; i++) {
      if (!exists[STAGE_ORDER[i]]) { from = STAGE_ORDER[i]; break }
    }
    runPipeline(target, from)
  }

  const handleCheckContinuity = async () => {
    setGenerating(true)
    setProgress('Checking continuity...')
    try {
      const result = await generationApi.checkContinuity(projectId, chapterId, currentContent)
      setIssues(result.issues)
      setProgress('Continuity check complete!')
    } catch {
      setProgress('Failed to check continuity')
    } finally {
      setGenerating(false)
    }
  }

  const stagePrereqMet = (s: PipelineStage) =>
    s === 'outline' ? true : s === 'draft' ? existingStages.outline : existingStages.draft

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Generation</h3>
        <button
          onClick={handlePreviewContext}
          disabled={loadingContext}
          className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          title="See exactly what the model will be given as context"
        >
          {loadingContext ? 'Loading…' : '🔍 Preview context'}
        </button>
      </div>

      {/* Context preview — what the LLM will actually see (tiered + token budget) */}
      {showContext && contextPreview && (
        <div className="mb-4 border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-700/50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Model context · ~{contextPreview.totalTokens.toLocaleString()} tokens
            </span>
            <button onClick={() => setShowContext(false)} className="text-xs text-gray-500 hover:underline">Hide</button>
          </div>
          <div className="max-h-72 overflow-y-auto p-4 space-y-3 text-xs">
            {([
              ['Tier 1 — Core', contextPreview.tier1],
              ['Tier 2 — Chapter-relevant (retrieved)', contextPreview.tier2],
              ['Tier 3 — Recent narrative', contextPreview.tier3],
            ] as const).map(([label, body]) => (
              <div key={label}>
                <div className="font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</div>
                <pre className="whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40 p-2 rounded">
                  {body?.trim() ? body : '(empty)'}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation options */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Target Words</label>
          <input
            type="number"
            value={options.wordCount}
            onChange={(e) => setOptions({ ...options, wordCount: parseInt(e.target.value) || 2000 })}
            className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tension (1-10)</label>
          <input
            type="number" min="1" max="10"
            value={options.tension}
            onChange={(e) => setOptions({ ...options, tension: parseInt(e.target.value) || 5 })}
            className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Focus</label>
          <select
            value={options.focus}
            onChange={(e) => setOptions({ ...options, focus: e.target.value })}
            className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          >
            <option>Balanced</option>
            <option>Action</option>
            <option>Character</option>
            <option>Dialogue</option>
            <option>Atmosphere</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Generate up to</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as PipelineStage)}
            className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          >
            <option value="outline">Outline only</option>
            <option value="draft">Outline → Draft</option>
            <option value="final">Outline → Draft → Final</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Style Profile {target === 'final' ? '(applied at Final)' : '(optional)'}
          </label>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          >
            <option value="">No profile</option>
            {styleProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {generating ? 'Generating…' : `Generate (up to ${STAGE_LABEL[target]})`}
      </button>

      {/* Per-stage regeneration: regenerate one stage from its predecessor. */}
      <div className="mt-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Regenerate a single stage (from its predecessor):</p>
        <div className="flex gap-2">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => runPipeline(s, s)}
              disabled={generating || !stagePrereqMet(s)}
              title={!stagePrereqMet(s) ? `Needs ${s === 'draft' ? 'an outline' : 'a draft'} first` : `Regenerate ${STAGE_LABEL[s]}`}
              className="flex-1 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40"
            >
              ↻ {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Continuity check */}
      <div className="mt-4 border-t dark:border-gray-700 pt-4">
        <button
          onClick={handleCheckContinuity}
          disabled={generating || !currentContent.trim()}
          className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {generating ? 'Working…' : 'Check Continuity'}
        </button>
        {issues.length > 0 && (
          <div className="space-y-2 mt-3">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Continuity Issues Found:</h4>
            {issues.map((issue, i) => (
              <div key={i} className={`p-3 rounded border ${
                issue.severity === 'high' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                issue.severity === 'medium' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
                'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-gray-700 dark:text-gray-300">{issue.type}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{issue.severity}</span>
                </div>
                <p className="text-sm mt-1 text-gray-900 dark:text-gray-100">{issue.issue}</p>
                {issue.suggestion && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">💡 {issue.suggestion}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {progress && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-center text-sm text-gray-700 dark:text-gray-300">
          {progress}
        </div>
      )}
    </div>
  )
}
