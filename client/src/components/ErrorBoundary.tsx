// client/src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Catches render-time errors in a route's content so one broken page shows a
 * recoverable message instead of blanking the whole app. Place it around the
 * routed <Outlet/>, keyed by pathname so navigation resets it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {this.state.error?.message ||
              'An unexpected error occurred while rendering this page.'}
          </p>
          <button
            onClick={() => { window.location.href = '/' }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
