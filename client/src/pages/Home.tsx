import { useNavigate } from 'react-router-dom'
import { useProjects } from '../store/projects'

export default function HomePage() {
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects()

  const recentProjects = projects?.slice(0, 3) || []

  return (
    <div className="p-8">
      {/* Hero Section */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Welcome to Chronicle
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
          Your AI-powered writing companion for long-form novels. 
          Build worlds, develop characters, and write with intelligent assistance.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate('/projects')}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition"
          >
            View Projects
          </button>
          <button
            onClick={() => navigate('/projects/new')}
            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition"
          >
            Create New Project
          </button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <FeatureCard
          icon="📚"
          title="Knowledge Bank"
          description="Build detailed worlds, characters, locations, and lore. Everything linked and organized for easy reference."
        />
        <FeatureCard
          icon="✨"
          title="AI Generation"
          description="Generate chapters with AI assistance. Multi-pass workflow with outline, draft, style, and continuity checks."
        />
        <FeatureCard
          icon="🔄"
          title="Story Continuity"
          description="Automatic state snapshots track character and world changes. Maintain consistency across 400k+ words."
        />
        <FeatureCard
          icon="🎨"
          title="Style Profiles"
          description="Extract and apply your unique writing style. Check for style drift across chapters."
        />
        <FeatureCard
          icon="📊"
          title="Analytics"
          description="Track word counts, chapter progress, and writing sessions. Visualize your novel's growth."
        />
        <FeatureCard
          icon="🌙"
          title="Dark Mode"
          description="Easy on the eyes for those late-night writing sessions. Toggle anytime."
        />
      </div>

      {/* Recent Projects */}
      {!isLoading && recentProjects.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recent Projects</h2>
            <button
              onClick={() => navigate('/projects')}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => {
                  navigate(`/projects/${project.id}`)
                }}
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:shadow-md transition cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {project.title}
                </h3>
                {project.logline && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {project.logline}
                  </p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {project.currentWordCount.toLocaleString()} words
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {!isLoading && projects && projects.length > 0 && (
        <div className="grid md:grid-cols-4 gap-4 mt-8">
          <StatCard
            label="Total Projects"
            value={projects.length.toString()}
          />
          <StatCard
            label="Total Words"
            value={projects.reduce((sum, p) => sum + p.currentWordCount, 0).toLocaleString()}
          />
          <StatCard
            label="Total Chapters"
            value={projects.reduce((sum, p) => sum + (p as any).chapters || 0, 0).toString()}
          />
          <StatCard
            label="Target Words"
            value={projects.reduce((sum, p) => sum + p.targetWordCount, 0).toLocaleString()}
          />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!projects || projects.length === 0) && (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No projects yet. Start your writing journey today!
          </p>
          <button
            onClick={() => navigate('/projects/new')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Your First Project
          </button>
        </div>
      )}
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-md transition">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">{value}</div>
      <div className="text-gray-600 dark:text-gray-400 text-sm">{label}</div>
    </div>
  )
}
