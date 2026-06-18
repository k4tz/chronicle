// client/src/App.tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/Home'
import ProjectList from './pages/ProjectList'
import ProjectDetail from './pages/ProjectDetail'
import WorldFoundationPage from './pages/WorldFoundation'
import CharactersPage from './pages/Characters'
import LocationsPage from './pages/Locations'
import LorePage from './pages/Lore'
import StoryArcsPage from './pages/StoryArcs'
import PlotThreadsPage from './pages/PlotThreads'
import ForeshadowingPage from './pages/Foreshadowing'
import IdeasPage from './pages/Ideas'
import RelationshipsPage from './pages/Relationships'
import StyleProfilesPage from './pages/StyleProfiles'
import StyleProfileEditorPage from './pages/StyleProfileEditor'
import ChaptersPage from './pages/Chapters'
import ChapterEditorPage from './pages/ChapterEditor'
import AnalyticsPage from './pages/Analytics'
import TimelinePage from './pages/Timeline'

function NotFound() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Page not found</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-4">This page doesn't exist.</p>
      <Link to="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Go home</Link>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="projects" element={<ProjectList />} />
          <Route path="projects/new" element={<ProjectList />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:projectId/chapters" element={<ChaptersPage />} />
          <Route path="projects/:projectId/chapters/:chapterId" element={<ChapterEditorPage />} />
          <Route path="projects/:projectId/world" element={<WorldFoundationPage />} />
          <Route path="projects/:projectId/characters" element={<CharactersPage />} />
          <Route path="projects/:projectId/locations" element={<LocationsPage />} />
          <Route path="projects/:projectId/lore" element={<LorePage />} />
          <Route path="projects/:projectId/arcs" element={<StoryArcsPage />} />
          <Route path="projects/:projectId/threads" element={<PlotThreadsPage />} />
          <Route path="projects/:projectId/foreshadowing" element={<ForeshadowingPage />} />
          <Route path="projects/:projectId/ideas" element={<IdeasPage />} />
          <Route path="projects/:projectId/relationships" element={<RelationshipsPage />} />
          <Route path="projects/:projectId/style-profiles" element={<StyleProfilesPage />} />
          <Route path="projects/:projectId/style-profiles/:profileId" element={<StyleProfileEditorPage />} />
          <Route path="projects/:projectId/analytics" element={<AnalyticsPage />} />
          <Route path="projects/:projectId/timeline" element={<TimelinePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
