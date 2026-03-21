// client/src/components/GenerationPanel.tsx
import { useState } from 'react'
import { generationApi, StyleProfileRecord } from '../api/api'

interface GenerationPanelProps {
  projectId: string
  chapterId: string
  onGenerate: (content: string) => void
  styleProfiles: StyleProfileRecord[]
}

export default function GenerationPanel({ projectId, chapterId, onGenerate, styleProfiles }: GenerationPanelProps) {
  const [step, setStep] = useState<'outline' | 'draft' | 'style' | 'check'>('outline')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [options, setOptions] = useState({
    wordCount: 2000,
    tension: 5,
    focus: 'Balanced',
  })
  const [issues, setIssues] = useState<Array<{ type: string; severity: string; issue: string; suggestion?: string }>>([])

  const handleGenerateOutline = async () => {
    setGenerating(true)
    setProgress('Generating outline...')
    try {
      const result = await generationApi.generateOutline(projectId, chapterId, {
        ...options,
        styleProfileId: selectedProfile || undefined,
      })
      onGenerate(result.outline)
      setStep('draft')
      setProgress('')
    } catch (error) {
      setProgress('Failed to generate outline')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateDraft = async () => {
    setGenerating(true)
    setProgress('Generating draft...')
    try {
      const stream = await generationApi.generateDraft(projectId, chapterId, selectedProfile || undefined)
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        
        for (const line of lines) {
          const data = JSON.parse(line.slice(5))
          if (data.type === 'chunk') {
            fullContent += data.content
            setProgress(`Generating... ${data.tokenCount || 0} tokens`)
          } else if (data.type === 'complete') {
            setProgress('Draft complete!')
          } else if (data.type === 'error') {
            setProgress('Generation failed')
          }
        }
      }

      onGenerate(fullContent)
      setStep('style')
    } catch (error) {
      setProgress('Failed to generate draft')
    } finally {
      setGenerating(false)
    }
  }

  const handleStylePass = async () => {
    if (!selectedProfile) {
      alert('Please select a style profile')
      return
    }

    setGenerating(true)
    setProgress('Applying style pass...')
    try {
      const stream = await generationApi.generateStylePass(projectId, chapterId, selectedProfile)
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        
        for (const line of lines) {
          const data = JSON.parse(line.slice(5))
          if (data.type === 'chunk') {
            fullContent += data.content
          }
        }
      }

      onGenerate(fullContent)
      setStep('check')
      setProgress('Style pass complete!')
    } catch (error) {
      setProgress('Failed to apply style')
    } finally {
      setGenerating(false)
    }
  }

  const handleCheckContinuity = async (content: string) => {
    setGenerating(true)
    setProgress('Checking continuity...')
    try {
      const result = await generationApi.checkContinuity(projectId, chapterId, content)
      setIssues(result.issues)
      setProgress('Continuity check complete!')
    } catch (error) {
      setProgress('Failed to check continuity')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">AI Generation</h3>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-4">
        {['outline', 'draft', 'style', 'check'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-blue-600 text-white' :
              ['outline', 'draft', 'style', 'check'].indexOf(step) > i ? 'bg-green-600 text-white' :
              'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {i + 1}
            </div>
            {i < 3 && <div className={`w-8 h-0.5 ${['outline', 'draft', 'style', 'check'].indexOf(step) > i ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
          </div>
        ))}
      </div>

      {/* Options */}
      {step === 'outline' && (
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-3 gap-4">
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
                type="number"
                min="1"
                max="10"
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
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Style Profile (optional)</label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="">No profile</option>
              {styleProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerateOutline}
            disabled={generating}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Outline'}
          </button>
        </div>
      )}

      {step === 'draft' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">Outline ready. Generate the full draft?</p>
          <button
            onClick={handleGenerateDraft}
            disabled={generating}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Draft'}
          </button>
        </div>
      )}

      {step === 'style' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Style Profile (required)</label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="">Select profile</option>
              {styleProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleStylePass}
            disabled={generating || !selectedProfile}
            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {generating ? 'Applying Style...' : 'Apply Style Pass'}
          </button>
        </div>
      )}

      {step === 'check' && (
        <div className="space-y-4">
          <button
            onClick={() => handleCheckContinuity('')}
            disabled={generating}
            className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {generating ? 'Checking...' : 'Check Continuity'}
          </button>
          {issues.length > 0 && (
            <div className="space-y-2">
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
      )}

      {progress && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-center text-sm text-gray-700 dark:text-gray-300">
          {progress}
        </div>
      )}
    </div>
  )
}
