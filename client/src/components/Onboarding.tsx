// client/src/components/Onboarding.tsx
//
// "Start here" funnel (C3). New projects drop the author into 14 modules with no
// guidance; this checklist sequences the essentials (seed world → cast → places
// → first chapter), reflects real progress, and hides itself once complete.
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { charactersApi, locationsApi, chaptersApi } from '../api/api'

interface OnboardingProps {
  projectId: string
  world: any | null
}

export default function Onboarding({ projectId, world }: OnboardingProps) {
  const navigate = useNavigate()
  const chars = useQuery({ queryKey: ['characters', projectId], queryFn: () => charactersApi.list(projectId) })
  const locs = useQuery({ queryKey: ['locations', projectId], queryFn: () => locationsApi.list(projectId) })
  const chaps = useQuery({ queryKey: ['chapters', projectId], queryFn: () => chaptersApi.list(projectId) })

  const worldSeeded = !!(world && [world.cosmology, world.history, world.geography, world.culture, world.politicalLandscape, world.economy, world.magicOrTechRules].some(Boolean))

  const steps = [
    { done: worldSeeded, label: 'Seed your world', hint: 'Cosmology, history, geography — the canon Chronicle remembers', path: `/projects/${projectId}/world` },
    { done: (chars.data?.length || 0) > 0, label: 'Add your first character', hint: 'The cast the model tracks across chapters', path: `/projects/${projectId}/characters` },
    { done: (locs.data?.length || 0) > 0, label: 'Add a location', hint: 'Where your story happens', path: `/projects/${projectId}/locations` },
    { done: (chaps.data?.length || 0) > 0, label: 'Start Chapter 1', hint: 'Write it yourself or generate a draft', path: `/projects/${projectId}/chapters` },
  ]

  // Wait for the queries before deciding to hide (avoids a flash).
  const loaded = !chars.isLoading && !locs.isLoading && !chaps.isLoading
  const completed = steps.filter((s) => s.done).length
  if (loaded && completed === steps.length) return null

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Getting started</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">{completed}/{steps.length} done</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Set up the essentials so Chronicle can keep your story consistent. Skip ahead anytime — this guide disappears once you're set up.
      </p>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.label}>
            <button
              onClick={() => navigate(s.path)}
              className="w-full flex items-center gap-3 text-left p-3 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? 'bg-green-600 text-white' : 'border-2 border-gray-300 dark:border-gray-600 text-gray-400'}`}>
                {s.done ? '✓' : ''}
              </span>
              <span className="flex-1">
                <span className={`font-medium ${s.done ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{s.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{s.hint}</span>
              </span>
              <span className="text-gray-400">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
