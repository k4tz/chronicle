// client/src/pages/StyleProfiles.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { styleProfilesApi, StyleProfileRecord } from '../api/api'

export default function StyleProfilesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<StyleProfileRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [profileName, setProfileName] = useState('')

  useEffect(() => { loadProfiles() }, [projectId])

  const loadProfiles = () => {
    if (!projectId) return
    setLoading(true)
    styleProfilesApi.list(projectId)
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !profileName.trim()) return
    try {
      await styleProfilesApi.create(projectId, { name: profileName })
      setProfileName('')
      setShowForm(false)
      loadProfiles()
    } catch (error) {
      console.error('Failed to create profile:', error)
      alert('Failed to create style profile')
    }
  }

  const handleDelete = async (id: string) => {
    if (!projectId) return
    if (!confirm('Delete this style profile?')) return
    try {
      await styleProfilesApi.delete(projectId, id)
      loadProfiles()
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete style profile')
    }
  }

  if (loading) return <div className="p-8">Loading style profiles...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Style Profiles</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            ← Back to Project
          </button>
          <button onClick={() => setShowForm(!showForm)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ New Profile'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Style Profile</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name (e.g., My Writing Style)"
              className="flex-1 px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              required
            />
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Create
            </button>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-3">
            After creating a profile, you can upload writing samples and use AI to extract the style automatically.
          </p>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold">{profile.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Created {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/projects/${projectId}/style-profiles/${profile.id}`)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(profile.id)}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {profile.extractedProfile ? (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm">
                  ✓ Style Extracted
                </span>
              ) : (
                <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full text-sm">
                  ! No samples yet
                </span>
              )}
              {profile.extractedProfile && (
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400 mt-3">
                  <div>Sentences: <strong>{profile.extractedProfile.sentenceLengthTendency}</strong></div>
                  <div>Metaphors: <strong>{profile.extractedProfile.metaphorDensity}</strong></div>
                  <div>Vocabulary: <strong>{profile.extractedProfile.vocabularyRegister}</strong></div>
                  <div>Pacing: <strong>{profile.extractedProfile.pacingRhythm}</strong></div>
                </div>
              )}
            </div>
          </div>
        ))}
        {profiles.length === 0 && (
          <div className="col-span-full text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">No style profiles yet. Create one to get started!</p>
          </div>
        )}
      </div>
    </div>
  )
}
