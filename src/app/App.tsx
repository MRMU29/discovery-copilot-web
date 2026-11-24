import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import AppRouter from './router'

export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}
