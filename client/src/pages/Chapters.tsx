// client/src/pages/Chapters.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chaptersApi, Chapter, arcsApi, styleProfilesApi, StoryArc, StyleProfileRecord } from '../api/api'

export default function ChaptersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [arcs, setArcs] = useState<StoryArc[]>([])
  const [styleProfiles, setStyleProfiles] = useState<StyleProfileRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [formData, setFormData] = useState<Partial<Chapter>>({
    number: 1,
    title: '',
    arcId: '',
    styleProfileId: '',
    status: 'outline',
  })

  useEffect(() => { loadAllData() }, [projectId])

  const loadAllData = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      chaptersApi.list(projectId),
      arcsApi.list(projectId),
      styleProfilesApi.list(projectId),
    ]).then(([chaptersData, arcsData, profilesData]) => {
      setChapters(chaptersData.sort((a, b) => a.number - b.number))
      setArcs(arcsData)
      setStyleProfiles(profilesData)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      if (editingChapter) {
        await chaptersApi.update(projectId, editingChapter.id, formData)
      } else {
        await chaptersApi.create(projectId, formData)
      }
      setShowForm(false)
      setEditingChapter(null)
      setFormData({ number: 1, title: '', arcId: '', styleProfileId: '', status: 'outline' })
      loadAllData()
    } catch (error) {
      console.error('Failed to save chapter:', error)
      alert('Failed to save chapter')
    }
  }

  const handleEdit = (chapter: Chapter) => {
    setEditingChapter(chapter)
    setFormData({
      number: chapter.number,
      title: chapter.title || '',
      arcId: chapter.arcId || '',
      styleProfileId: chapter.styleProfileId || '',
      status: chapter.status,
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this chapter?')) return
    try { await chaptersApi.delete(projectId, id); loadAllData() } catch { alert('Failed to delete') }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      outline: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      style: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      final: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    }
    return colors[status] || colors.outline
  }

  if (loading) return <div className="p-8 text-gray-500 dark:text-gray-400">Loading chapters...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Chapters</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            ← Back to Project
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingChapter(null); setFormData({ number: chapters.length + 1, title: '', arcId: '', styleProfileId: '', status: 'outline' }) }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Chapter'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{editingChapter ? 'Edit Chapter' : 'New Chapter'}</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Chapter Number *</label>
              <input
                type="number"
                min="1"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Title</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Chapter title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Chapter['status'] })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              >
                <option value="outline">Outline</option>
                <option value="draft">Draft</option>
                <option value="style">Style Pass</option>
                <option value="review">Review</option>
                <option value="final">Final</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Story Arc</label>
              <select
                value={formData.arcId || ''}
                onChange={(e) => setFormData({ ...formData, arcId: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              >
                <option value="">No arc</option>
                {arcs.map(arc => <option key={arc.id} value={arc.id}>{arc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Style Profile</label>
              <select
                value={formData.styleProfileId || ''}
                onChange={(e) => setFormData({ ...formData, styleProfileId: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              >
                <option value="">No profile</option>
                {styleProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-6">
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {editingChapter ? 'Update' : 'Create'} Chapter
            </button>
          </div>
        </form>
      )}

      {/* Chapter List */}
      <div className="space-y-3">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow flex items-center justify-between hover:shadow-md transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                {chapter.number}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{chapter.title || `Chapter ${chapter.number}`}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(chapter.status)}`}>
                    {chapter.status}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{chapter.wordCount.toLocaleString()} words</span>
                  {chapter.arcId && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      • Arc: {arcs.find(a => a.id === chapter.arcId)?.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/projects/${projectId}/chapters/${chapter.id}`)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Edit
              </button>
              <button onClick={() => handleEdit(chapter)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm">
                Settings
              </button>
              <button onClick={() => handleDelete(chapter.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm">
                Delete
              </button>
            </div>
          </div>
        ))}

        {chapters.length === 0 && (
          <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">No chapters yet. Create one to start writing!</p>
          </div>
        )}
      </div>
    </div>
  )
}
