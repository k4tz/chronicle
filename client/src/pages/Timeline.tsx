// client/src/pages/Timeline.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../api/client'

interface TimelineEvent {
  id: string
  chapterNumber: number
  chapterTitle: string | null
  eventType: 'snapshot' | 'thread_opened' | 'thread_resolved' | 'foreshadowing_setup' | 'foreshadowing_payoff'
  title: string
  description: string
  timestamp: string
  metadata?: any
}

interface TimelineResponse {
  events: TimelineEvent[]
}

export default function TimelinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    apiClient.get<TimelineResponse>(`/projects/${projectId}/timeline`)
      .then(res => {
        setEvents(res.data.events)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.eventType === filter || (filter === 'foreshadowing' && e.eventType.includes('foreshadowing')))

  const groupedEvents = filteredEvents.reduce((acc, event) => {
    const chapter = `Chapter ${event.chapterNumber}`
    if (!acc[chapter]) acc[chapter] = []
    acc[chapter].push(event)
    return acc
  }, {} as Record<string, TimelineEvent[]>)

  const eventTypes = [
    { value: 'all', label: 'All Events', color: 'bg-gray-500' },
    { value: 'snapshot', label: 'Story Events', color: 'bg-blue-500' },
    { value: 'thread_opened', label: 'Threads Opened', color: 'bg-green-500' },
    { value: 'thread_resolved', label: 'Threads Resolved', color: 'bg-emerald-500' },
    { value: 'foreshadowing', label: 'Foreshadowing', color: 'bg-purple-500' },
  ]

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'thread_opened': return '🧵'
      case 'thread_resolved': return '✅'
      case 'foreshadowing_setup': return '🔮'
      case 'foreshadowing_payoff': return '💡'
      case 'snapshot':
      default:
        if (eventType.includes('fact')) return '📜'
        if (eventType.includes('change')) return '🌍'
        if (eventType.includes('char')) return '👤'
        return '📖'
    }
  }

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'thread_opened': return 'border-green-500 bg-green-50 dark:bg-green-900/20'
      case 'thread_resolved': return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
      case 'foreshadowing_setup': return 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
      case 'foreshadowing_payoff': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
      default: return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
    }
  }

  if (loading) return <div className="p-8">Loading timeline...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Event Timeline</h1>
        <div className="flex gap-2">
          {eventTypes.map(type => (
            <button
              key={type.value}
              onClick={() => setFilter(type.value)}
              className={`px-3 py-1.5 rounded-full text-sm transition ${
                filter === type.value
                  ? `${type.color} text-white`
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">No events yet. Events will appear as you create chapters and save snapshots.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600" />

          {/* Events grouped by chapter */}
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([chapter, chapterEvents]) => (
              <div key={chapter} className="relative">
                {/* Chapter header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg z-10">
                    {chapter.replace('Chapter ', '')}
                  </div>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600" />
                </div>

                {/* Events for this chapter */}
                <div className="ml-20 space-y-4">
                  {chapterEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                      className={`relative p-4 rounded-lg border-l-4 cursor-pointer transition hover:shadow-md ${getEventColor(event.eventType)} dark:border-opacity-50`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{getEventIcon(event.eventType)}</span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{event.title}</h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{event.description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                            {new Date(event.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {selectedEvent?.id === event.id ? '▼' : '▶'}
                        </button>
                      </div>

                      {/* Expanded details */}
                      {selectedEvent?.id === event.id && event.metadata && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-48">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats summary */}
      {events.length > 0 && (
        <div className="mt-12 grid grid-cols-4 gap-4">
          <StatCard
            label="Total Events"
            value={events.length.toString()}
            color="bg-gray-500"
          />
          <StatCard
            label="Story Events"
            value={events.filter(e => e.eventType === 'snapshot').length.toString()}
            color="bg-blue-500"
          />
          <StatCard
            label="Thread Changes"
            value={events.filter(e => e.eventType.includes('thread')).length.toString()}
            color="bg-green-500"
          />
          <StatCard
            label="Foreshadowing"
            value={events.filter(e => e.eventType.includes('foreshadowing')).length.toString()}
            color="bg-purple-500"
          />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
      <div className={`w-12 h-12 ${color} rounded-full flex items-center justify-center text-white font-bold mb-2`}>
        {value}
      </div>
      <div className="text-gray-600 dark:text-gray-400 text-sm">{label}</div>
    </div>
  )
}
