// client/src/components/Layout.tsx
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useProjectsStore } from '../store/projects'
import ErrorBoundary from './ErrorBoundary'
import CommandPalette, { Command } from './CommandPalette'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const setSelectedProjectId = useProjectsStore((state) => state.setSelectedProjectId)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  const projectId = urlProjectId || selectedProjectId

  const navItems = projectId ? [
    { label: 'Project', path: `/projects/${projectId}` },
    { label: 'Chapters', path: `/projects/${projectId}/chapters` },
    { label: 'World', path: `/projects/${projectId}/world` },
    { label: 'Characters', path: `/projects/${projectId}/characters` },
    { label: 'Relationships', path: `/projects/${projectId}/relationships` },
    { label: 'Locations', path: `/projects/${projectId}/locations` },
    { label: 'Lore', path: `/projects/${projectId}/lore` },
    { label: 'Arc Planner', path: `/projects/${projectId}/arc-planner` },
    { label: 'Ideas', path: `/projects/${projectId}/ideas` },
    { label: 'Style', path: `/projects/${projectId}/style-profiles` },
    { label: 'Analytics', path: `/projects/${projectId}/analytics` },
    { label: 'Timeline', path: `/projects/${projectId}/timeline` },
  ] : []

  // Commands for the ⌘/Ctrl+K palette: global nav + every project tool.
  const commands = useMemo<Command[]>(() => [
    { label: 'Home', hint: 'go', action: () => navigate('/') },
    { label: 'Projects', hint: 'go', action: () => navigate('/projects') },
    { label: 'New Project', hint: 'create', action: () => navigate('/projects/new') },
    ...navItems.map((item) => ({ label: item.label, hint: 'project', action: () => navigate(item.path) })),
  ], [navItems, navigate])

  const SidebarBody = (
    <>
      <div className="p-4 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-xl font-bold hover:text-blue-400 transition">
          Chronicle
        </button>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          <li>
            <button onClick={() => navigate('/')} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition">🏠 Home</button>
          </li>
          <li>
            <button onClick={() => navigate('/projects')} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition">📁 Projects</button>
          </li>
          {projectId && (
            <>
              <li className="pt-4 pb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Project Tools</span>
              </li>
              {navItems.map((item) => (
                <li key={item.path}>
                  <button onClick={() => navigate(item.path)} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition">
                    {item.label}
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800 text-xs text-gray-400 space-y-1">
        <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="hover:text-gray-200">⌘/Ctrl+K · Command palette</button>
        <div>v1.0.0</div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-gray-900 text-white flex-col">{SidebarBody}</aside>

      {/* Mobile slide-over sidebar */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 bg-gray-900 text-white flex flex-col">{SidebarBody}</aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 p-3 bg-gray-900 text-white">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="text-2xl leading-none">☰</button>
          <button onClick={() => navigate('/')} className="font-bold">Chronicle</button>
        </div>

        <main className="flex-1 overflow-auto bg-white dark:bg-gray-900 dark:text-gray-100">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette commands={commands} />
    </div>
  )
}
