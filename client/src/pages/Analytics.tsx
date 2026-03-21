// client/src/pages/Analytics.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { chaptersApi, charactersApi, Chapter, Character } from '../api/api'

export default function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [stats, setStats] = useState({
    totalWords: 0,
    totalChapters: 0,
    avgWordsPerChapter: 0,
    completedChapters: 0,
    draftChapters: 0,
    outlineChapters: 0,
  })

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      chaptersApi.list(projectId),
      charactersApi.list(projectId),
    ]).then(([chaptersData, charsData]) => {
      setChapters(chaptersData)
      setCharacters(charsData)

      const totalWords = chaptersData.reduce((sum, ch) => sum + ch.wordCount, 0)
      const completed = chaptersData.filter(ch => ch.status === 'final').length
      const draft = chaptersData.filter(ch => ch.status === 'draft' || ch.status === 'style' || ch.status === 'review').length
      const outline = chaptersData.filter(ch => ch.status === 'outline').length

      setStats({
        totalWords,
        totalChapters: chaptersData.length,
        avgWordsPerChapter: chaptersData.length > 0 ? Math.round(totalWords / chaptersData.length) : 0,
        completedChapters: completed,
        draftChapters: draft,
        outlineChapters: outline,
      })
    }).catch(console.error).finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <div className="p-8">Loading analytics...</div>

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Writing Analytics</h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Words" value={stats.totalWords.toLocaleString()} />
        <StatCard label="Chapters" value={stats.totalChapters.toString()} />
        <StatCard label="Avg Words/Chapter" value={stats.avgWordsPerChapter.toLocaleString()} />
        <StatCard label="Characters" value={characters.length.toString()} />
      </div>

      {/* Chapter Status */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Chapter Status</h3>
          <div className="space-y-3">
            <ProgressBar label="Completed" value={stats.completedChapters} max={stats.totalChapters} color="bg-green-500" />
            <ProgressBar label="In Progress" value={stats.draftChapters} max={stats.totalChapters} color="bg-blue-500" />
            <ProgressBar label="Outline" value={stats.outlineChapters} max={stats.totalChapters} color="bg-gray-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Word Count Goal</h3>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
              {Math.round((stats.totalWords / 100000) * 100)}%
            </div>
            <p className="text-gray-600 dark:text-gray-400">of 100,000 words</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mt-4">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-4 rounded-full transition-all"
                style={{ width: `${Math.min((stats.totalWords / 100000) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">First Chapter:</span>
              <span className="font-medium">{chapters[0]?.number || 'N/A'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Latest Chapter:</span>
              <span className="font-medium">{chapters[chapters.length - 1]?.number || 'N/A'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Longest Chapter:</span>
              <span className="font-medium">
                {chapters.reduce((max, ch) => ch.wordCount > max ? ch.wordCount : max, 0).toLocaleString()} words
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Chapter Breakdown */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Chapter Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="text-left py-2 px-4">Chapter</th>
                <th className="text-left py-2 px-4">Title</th>
                <th className="text-left py-2 px-4">Status</th>
                <th className="text-right py-2 px-4">Words</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((ch) => (
                <tr key={ch.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="py-3 px-4">{ch.number}</td>
                  <td className="py-3 px-4">{ch.title || '-'}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs capitalize ${
                      ch.status === 'final' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      ch.status === 'review' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                      ch.status === 'style' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      ch.status === 'draft' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}>
                      {ch.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">{ch.wordCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{value}</div>
      <div className="text-gray-600 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>{value} / {max}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
