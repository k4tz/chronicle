// client/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectsProvider } from './store/projects'
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

function App() {
  return (
    <ProjectsProvider>
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
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectsProvider>
  )
}

export default App
