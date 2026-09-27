/**
 * Every page's code, by path. App.tsx lazy-loads each as its own chunk;
 * prefetchRoute() starts that download early — on hovering or focusing a
 * link — so a page swap usually rolls in the page itself, not its blueprint.
 */
export const pages = {
  '/': () => import('./pages/Garage'),
  '/pit-wall': () => import('./pages/PitWall'),
  '/portfolio': () => import('./pages/Portfolio'),
  '/litlink': () => import('./pages/LitLink'),
  '/hypotheses': () => import('./pages/Hypotheses'),
  '/mechanism': () => import('./pages/Mechanism'),
  '/assays': () => import('./pages/Assays'),
  '/radar': () => import('./pages/Radar'),
  '/power': () => import('./pages/Power'),
  '/aims': () => import('./pages/GrantAims'),
  '/suspension': () => import('./pages/Suspension'),
  '/graph': () => import('./pages/Graph'),
  '/theory': () => import('./pages/Theory'),
  '/review': () => import('./pages/Review'),
  '/protocol': () => import('./pages/SrmaProtocol'),
  '/screening': () => import('./pages/Screening'),
  '/prisma': () => import('./pages/Prisma'),
  '/studies': () => import('./pages/Studies'),
  '/meta': () => import('./pages/MetaAnalysis'),
  '/diagnostic': () => import('./pages/DiagnosticMA'),
  '/references': () => import('./pages/References'),
  '/evidence': () => import('./pages/EvidenceLibrary'),
  '/manuscript': () => import('./pages/Manuscript'),
  '/poster': () => import('./pages/Poster'),
  '/reviewers': () => import('./pages/Reviewers'),
  '/shared': () => import('./pages/SharedImport'),
  '*': () => import('./pages/NotFound'),
}

type Path = keyof typeof pages
const fetched = new Set<string>()

export function prefetchRoute(path: string) {
  const key = (path.startsWith('/shared/') ? '/shared' : path) as Path
  if (fetched.has(key) || !(key in pages)) return
  fetched.add(key)
  // a failed prefetch is harmless: the route retries when it renders
  pages[key]().catch(() => fetched.delete(key))
}
