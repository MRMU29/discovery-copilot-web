import {
  assumptionsRepo,
  experimentsRepo,
  ostRepo,
  projectsRepo,
  reportsRepo,
} from '@/db/repositories'
import {
  PACKAGE_MAX_BYTES,
  buildProjectPackageDocument,
  packageFileName,
  type ProjectPackageInput,
} from '@/lib/project-export'
import { loadBrandLogoDataUrl } from '@/lib/report-export'

/**
 * Aggregates one project into the read-only package (§v0.2.4). The 2 MB limit
 * is enforced on UTF-8 bytes — the same unit as the import ceiling — and is a
 * refusal, not a truncation: silently dropping reports would be worse than an
 * explicit error.
 */
export type ProjectPackageResult =
  | { ok: true; html: string; bytes: number; fileName: string }
  | { ok: false; reason: 'not-found' | 'too-large'; bytes: number }

export async function buildProjectPackage(projectId: string): Promise<ProjectPackageResult> {
  const project = await projectsRepo.get(projectId)
  if (!project || project.deletedAt) return { ok: false, reason: 'not-found', bytes: 0 }

  const [assumptions, experiments, ostNodes, reports] = await Promise.all([
    assumptionsRepo.byProject(projectId),
    experimentsRepo.byProject(projectId),
    ostRepo.byProject(projectId),
    reportsRepo.byProject(projectId),
  ])

  const input: ProjectPackageInput = { project, assumptions, experiments, ostNodes, reports }
  const html = buildProjectPackageDocument(input, await loadBrandLogoDataUrl())
  const bytes = new TextEncoder().encode(html).byteLength
  if (bytes > PACKAGE_MAX_BYTES) return { ok: false, reason: 'too-large', bytes }
  return { ok: true, html, bytes, fileName: packageFileName(project.name) }
}
