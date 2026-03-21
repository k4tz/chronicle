// client/src/pages/StyleProfileEditor.tsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { styleProfilesApi, StyleProfile, StyleDriftResult } from '../api/api'

export default function StyleProfileEditorPage() {
  const { projectId, profileId } = useParams<{ projectId: string; profileId: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [samples, setSamples] = useState<string[]>([])
  const [newSample, setNewSample] = useState('')
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [previewResult, setPreviewResult] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [driftText, setDriftText] = useState('')
  const [driftResult, setDriftResult] = useState<StyleDriftResult | null>(null)
  const [checkingDrift, setCheckingDrift] = useState(false)

  useEffect(() => { loadProfile() }, [projectId, profileId])

  const loadProfile = () => {
    if (!projectId || !profileId) return
    setLoading(true)
    styleProfilesApi.get(projectId, profileId)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleSave = async () => {
    if (!projectId || !profileId) return
    setSaving(true)
    try {
      await styleProfilesApi.update(projectId, profileId, {
        name: profile.name,
        extractedProfile: profile.extractedProfile,
      })
      alert('Style profile saved!')
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save style profile')
    } finally {
      setSaving(false)
    }
  }

  const handleAddSample = () => {
    if (!newSample.trim()) return
    setSamples([...samples, newSample.trim()])
    setNewSample('')
  }

  const handleRemoveSample = (index: number) => {
    setSamples(samples.filter((_, i) => i !== index))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !projectId) return

    setUploading(true)
    try {
      const fileReads = Array.from(files).map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (event) => resolve(event.target?.result as string)
          reader.onerror = reject
          reader.readAsText(file)
        })
      })

      const contents = await Promise.all(fileReads)
      
      // Upload to server
      const samplesData = Array.from(files).map((file: File, i: number) => ({
        filename: file.name,
        content: contents[i],
      }))
      
      await styleProfilesApi.uploadSamples(projectId, samplesData)
      alert(`Uploaded ${files.length} file(s) successfully!`)
      
      // Also add to local samples for extraction
      setSamples([...samples, ...contents])
    } catch (error) {
      console.error('Failed to upload files:', error)
      alert('Failed to upload files')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExtract = async () => {
    if (!projectId || samples.length === 0) return
    setExtracting(true)
    try {
      const result = await styleProfilesApi.extractStyle(projectId, samples)
      setProfile({ ...profile, extractedProfile: result.profile })
      alert('Style extracted successfully!')
    } catch (error) {
      console.error('Failed to extract:', error)
      alert('Failed to extract style. Make sure Ollama is running.')
    } finally {
      setExtracting(false)
    }
  }

  const handlePreview = async () => {
    if (!projectId || !previewText.trim() || !profile?.extractedProfile) return
    setPreviewing(true)
    try {
      const result = await styleProfilesApi.previewStyle(projectId, previewText, profile.extractedProfile)
      setPreviewResult(result.rewritten)
    } catch (error) {
      console.error('Failed to preview:', error)
      alert('Failed to preview style')
    } finally {
      setPreviewing(false)
    }
  }

  const handleCheckDrift = async () => {
    if (!projectId || !profileId || !driftText.trim() || !profile?.extractedProfile) return
    setCheckingDrift(true)
    try {
      const result = await styleProfilesApi.checkDrift(projectId, profileId, driftText)
      setDriftResult(result.drift)
    } catch (error) {
      console.error('Failed to check drift:', error)
      alert('Failed to check style drift')
    } finally {
      setCheckingDrift(false)
    }
  }

  const updateProfile = (field: keyof StyleProfile, value: any) => {
    setProfile({
      ...profile,
      extractedProfile: { ...profile.extractedProfile, [field]: value },
    })
  }

  if (loading) return <div className="p-8">Loading style profile...</div>

  const ep = profile?.extractedProfile

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Edit Style Profile</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/projects/${projectId}/style-profiles`)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            ← Back to Profiles
          </button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Profile Name */}
      <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <label className="block text-sm font-medium mb-1">Profile Name</label>
        <input
          type="text"
          value={profile?.name || ''}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      {/* Writing Samples */}
      <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Writing Samples</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Upload writing samples (txt files) or paste text to extract the style automatically.
        </p>

        {/* File Upload */}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="sample-upload"
          />
          <label
            htmlFor="sample-upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 cursor-pointer"
          >
            📁 Upload Files
          </label>
          {uploading && <span className="ml-2 text-gray-500 dark:text-gray-400">Uploading...</span>}
        </div>

        {/* Paste Sample */}
        <textarea
          value={newSample}
          onChange={(e) => setNewSample(e.target.value)}
          placeholder="Or paste a writing sample here (500+ words recommended)..."
          className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 dark:bg-gray-700 dark:border-gray-600"
          rows={6}
        />
        <div className="flex gap-4 mb-4">
          <button onClick={handleAddSample} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Add Pasted Sample
          </button>
          <button
            onClick={handleExtract}
            disabled={extracting || samples.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {extracting ? 'Extracting...' : '✨ Extract Style with AI'}
          </button>
        </div>
        {samples.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Added Samples ({samples.length}):</p>
            {samples.map((sample, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 truncate">
                  {sample.slice(0, 100)}...
                </span>
                <button onClick={() => handleRemoveSample(i)} className="text-red-600 dark:text-red-400 hover:underline text-sm">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style Profile Editor */}
      {ep && (
        <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Style Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sentence Length</label>
              <select value={ep.sentenceLengthTendency} onChange={(e) => updateProfile('sentenceLengthTendency', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
                <option value="varied">Varied</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Metaphor Density</label>
              <select value={ep.metaphorDensity} onChange={(e) => updateProfile('metaphorDensity', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="sparse">Sparse</option>
                <option value="moderate">Moderate</option>
                <option value="rich">Rich</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vocabulary</label>
              <select value={ep.vocabularyRegister} onChange={(e) => updateProfile('vocabularyRegister', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="simple">Simple</option>
                <option value="literary">Literary</option>
                <option value="archaic">Archaic</option>
                <option value="contemporary">Contemporary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pacing</label>
              <select value={ep.pacingRhythm} onChange={(e) => updateProfile('pacingRhythm', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="slow-burn">Slow Burn</option>
                <option value="moderate">Moderate</option>
                <option value="fast-paced">Fast Paced</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Dialogue Ratio (0-1)</label>
              <input type="number" min="0" max="1" step="0.1" value={ep.dialogueToNarrationRatio}
                onChange={(e) => updateProfile('dialogueToNarrationRatio', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description Density</label>
              <select value={ep.descriptionDensity} onChange={(e) => updateProfile('descriptionDensity', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="minimal">Minimal</option>
                <option value="moderate">Moderate</option>
                <option value="immersive">Immersive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">POV Intimacy</label>
              <select value={ep.povIntimacy} onChange={(e) => updateProfile('povIntimacy', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="distant">Distant</option>
                <option value="close">Close</option>
                <option value="deep">Deep</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Internal Monologue</label>
              <select value={ep.internalMonologue} onChange={(e) => updateProfile('internalMonologue', e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                <option value="none">None</option>
                <option value="occasional">Occasional</option>
                <option value="frequent">Frequent</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={ep.notes} onChange={(e) => updateProfile('notes', e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600" rows={3} />
          </div>
        </div>
      )}

      {/* Style Preview */}
      <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Style Preview</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Paste neutral text to see how it would be rewritten in this style.
        </p>
        <textarea
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="The man walked down the street. He was tired."
          className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4 dark:bg-gray-700 dark:border-gray-600"
          rows={4}
        />
        <button
          onClick={handlePreview}
          disabled={previewing || !previewText.trim() || !ep}
          className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {previewing ? 'Rewriting...' : 'Preview Rewrite'}
        </button>
        {previewResult && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/30 rounded border border-purple-200 dark:border-purple-800">
            <h3 className="font-medium text-purple-800 dark:text-purple-300 mb-2">Rewritten:</h3>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{previewResult}</p>
          </div>
        )}
      </div>

      {/* Style Drift Checker */}
      <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Style Drift Checker</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Paste a chapter to check how well it matches this style (0-100 score).
        </p>
        <textarea
          value={driftText}
          onChange={(e) => setDriftText(e.target.value)}
          placeholder="Paste chapter text here..."
          className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 dark:bg-gray-700 dark:border-gray-600"
          rows={6}
        />
        <button
          onClick={handleCheckDrift}
          disabled={checkingDrift || !driftText.trim() || !ep}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {checkingDrift ? 'Analyzing...' : 'Check Style Drift'}
        </button>
        {driftResult && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{driftResult.overallScore}</div>
              <div className="text-blue-800 dark:text-blue-300">Overall Match Score</div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-sm">Sentence Length: <strong>{driftResult.breakdown.sentenceLength}%</strong></div>
              <div className="text-sm">Metaphors: <strong>{driftResult.breakdown.metaphorDensity}%</strong></div>
              <div className="text-sm">Vocabulary: <strong>{driftResult.breakdown.vocabulary}%</strong></div>
              <div className="text-sm">Pacing: <strong>{driftResult.breakdown.pacing}%</strong></div>
              <div className="text-sm">Description: <strong>{driftResult.breakdown.descriptionDensity}%</strong></div>
              <div className="text-sm">POV: <strong>{driftResult.breakdown.povIntimacy}%</strong></div>
            </div>
            <p className="text-gray-700 dark:text-gray-300"><strong>Feedback:</strong> {driftResult.feedback}</p>
          </div>
        )}
      </div>
    </div>
  )
}
