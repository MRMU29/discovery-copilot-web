import { lazy } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import ProjectPage from '@/components/layout/ProjectPage'
import SettingsLayout from '@/components/layout/SettingsLayout'
import { ExportProbe } from '@/dev/ExportProbe'
import { TokensPreview } from '@/app/TokensPreview'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const AiProvider = lazy(() => import('@/pages/settings/AiProvider'))
const DataBackup = lazy(() => import('@/pages/settings/DataBackup'))
const Privacy = lazy(() => import('@/pages/settings/Privacy'))
const About = lazy(() => import('@/pages/settings/About'))

/**
 * §3.1 contract: /project/:projectId/<section> flat children, ≤3 segments;
 * unknown section renders overview in place (ProjectPage handles it).
 */
const router = createBrowserRouter([
  { path: '/dev/export-probe', element: <ExportProbe /> },
  { path: '/dev/tokens', element: <TokensPreview /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'project/:projectId/:section?', element: <ProjectPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="ai-provider" replace /> },
          { path: 'ai-provider', element: <AiProvider /> },
          { path: 'data-backup', element: <DataBackup /> },
          { path: 'privacy', element: <Privacy /> },
          { path: 'about', element: <About /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
