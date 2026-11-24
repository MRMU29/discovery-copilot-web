import { Suspense, lazy } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import ProjectPage from '@/components/layout/ProjectPage'
import SettingsLayout from '@/components/layout/SettingsLayout'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const AiProvider = lazy(() => import('@/pages/settings/AiProvider'))
const Appearance = lazy(() => import('@/pages/settings/Appearance'))
const DataBackup = lazy(() => import('@/pages/settings/DataBackup'))
const Privacy = lazy(() => import('@/pages/settings/Privacy'))
const About = lazy(() => import('@/pages/settings/About'))
const Product = lazy(() => import('@/pages/settings/Product'))
const Terms = lazy(() => import('@/pages/settings/Terms'))

const ExportProbe = lazy(() => import('@/dev/ExportProbe').then((m) => ({ default: m.ExportProbe })))
const TokensPreview = lazy(() => import('@/app/TokensPreview').then((m) => ({ default: m.TokensPreview })))

/**
 * Development probes are dev-only (§audit P0-2): `import.meta.env.DEV` is a
 * statically-replaced literal, so in a production build this branch collapses to
 * `[]` and the lazy imports (ExportProbe pulls in html-to-image) are tree-shaken
 * out of the bundle entirely. In dev they stay lazy to keep the first paint cheap.
 */
const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/export-probe',
        element: (
          <Suspense>
            <ExportProbe />
          </Suspense>
        ),
      },
      {
        path: '/dev/tokens',
        element: (
          <Suspense>
            <TokensPreview />
          </Suspense>
        ),
      },
    ]
  : []

/**
 * §3.1 contract: /project/:projectId/<section> flat children, ≤3 segments;
 * unknown section renders overview in place (ProjectPage handles it).
 */
const router = createBrowserRouter([
  ...devRoutes,
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
          { path: 'appearance', element: <Appearance /> },
          { path: 'data-backup', element: <DataBackup /> },
          { path: 'privacy', element: <Privacy /> },
          { path: 'about', element: <About /> },
          { path: 'product', element: <Product /> },
          { path: 'terms', element: <Terms /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
