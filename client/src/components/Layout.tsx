// client/src/components/Layout.tsx
import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useProjectsStore } from '../store/projects'
import DarkModeToggle from './DarkModeToggle'
import ErrorBoundary from './ErrorBoundary'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const setSelectedProjectId = useProjectsStore((state) => state.setSelectedProjectId)

  // Derive the active project from the URL — this works on every nested route
  // (the Layout route itself has no params) — and remember it so the sidebar
  // stays populated on pages without a project id and across reloads.
  const match = location.pathname.match(/\/projects\/([^/]+)/)
  const urlProjectId = match && match[1] !== 'new' ? match[1] : null

  useEffect(() => {
    if (urlProjectId && urlProjectId !== selectedProjectId) {
      setSelectedProjectId(urlProjectId)
    }
  }, [urlProjectId, selectedProjectId, setSelectedProjectId])

  const projectId = urlProjectId || selectedProjectId

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
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={() => navigate('/')}
            className="text-xl font-bold hover:text-blue-400 transition"
          >
            Chronicle
          </button>
          <div className="mt-2">
            <DarkModeToggle />
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => navigate('/')}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition"
              >
                🏠 Home
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate('/projects')}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition"
              >
                📁 Projects
              </button>
            </li>
            {projectId && (
              <>
                <li className="pt-4 pb-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    Project Tools
                  </span>
                </li>
                {navItems.map((item) => (
                  <li key={item.path}>
                    <button
                      onClick={() => navigate(item.path)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800 text-sm text-gray-400">
          v1.0.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-white dark:bg-gray-900 dark:text-gray-100">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
