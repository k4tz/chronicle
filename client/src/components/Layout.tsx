// client/src/components/Layout.tsx
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useProjectsStore } from '../store/projects'
import DarkModeToggle from './DarkModeToggle'

export default function Layout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const projectId = id || selectedProjectId

  const navItems = projectId ? [
    { label: 'Project', path: `/projects/${projectId}` },
    { label: 'Chapters', path: `/projects/${projectId}/chapters` },
    { label: 'World', path: `/projects/${projectId}/world` },
    { label: 'Characters', path: `/projects/${projectId}/characters` },
    { label: 'Relationships', path: `/projects/${projectId}/relationships` },
    { label: 'Locations', path: `/projects/${projectId}/locations` },
    { label: 'Lore', path: `/projects/${projectId}/lore` },
    { label: 'Arcs', path: `/projects/${projectId}/arcs` },
    { label: 'Plot Threads', path: `/projects/${projectId}/threads` },
    { label: 'Foreshadowing', path: `/projects/${projectId}/foreshadowing` },
    { label: 'Ideas', path: `/projects/${projectId}/ideas` },
    { label: 'Style', path: `/projects/${projectId}/style-profiles` },
    { label: 'Analytics', path: `/projects/${projectId}/analytics` },
    { label: 'Timeline', path: `/projects/${projectId}/timeline` },
  ] : []

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-xl font-bold">Chronicle</h1>
          <DarkModeToggle />
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            <li>
              <a href="/" className="block px-3 py-2 rounded hover:bg-gray-800">
                All Projects
              </a>
            </li>
            {projectId && navItems.map((item) => (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-800"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800 text-sm text-gray-400">
          v1.0.0 - All Phases
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-white dark:bg-gray-900 dark:text-gray-100">
        <Outlet />
      </main>
    </div>
  )
}
