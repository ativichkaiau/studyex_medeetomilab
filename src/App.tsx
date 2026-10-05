import { lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { pages } from './routes'

// Every page is its own chunk: the shell loads first, and a page's code
// arrives when it is first visited (or hovered — see routes.ts). Meanwhile
// Layout's Suspense boundary shows that page's blueprint (components/Skeleton.tsx).
const EvidenceLibrary = lazy(pages['/evidence'])
const Garage = lazy(pages['/'])
const PitWall = lazy(pages['/pit-wall'])
const Portfolio = lazy(pages['/portfolio'])
const LitLink = lazy(pages['/litlink'])
const Hypotheses = lazy(pages['/hypotheses'])
const Mechanism = lazy(pages['/mechanism'])
const Assays = lazy(pages['/assays'])
const Radar = lazy(pages['/radar'])
const Power = lazy(pages['/power'])
const GrantAims = lazy(pages['/aims'])
const Suspension = lazy(pages['/suspension'])
const Graph = lazy(pages['/graph'])
const Review = lazy(pages['/review'])
const Theory = lazy(pages['/theory'])
const SrmaProtocol = lazy(pages['/protocol'])
const Screening = lazy(pages['/screening'])
const Prisma = lazy(pages['/prisma'])
const Studies = lazy(pages['/studies'])
const Rob = lazy(pages['/rob'])
const MetaAnalysis = lazy(pages['/meta'])
const DiagnosticMA = lazy(pages['/diagnostic'])
const References = lazy(pages['/references'])
const Artifacts = lazy(pages['/artifacts'])
const Manuscript = lazy(pages['/manuscript'])
const Poster = lazy(pages['/poster'])
const Reviewers = lazy(pages['/reviewers'])
const SharedImport = lazy(pages['/shared'])
const NotFound = lazy(pages['*'])

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Garage />} />
        <Route path="pit-wall" element={<PitWall />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="litlink" element={<LitLink />} />
        <Route path="hypotheses" element={<Hypotheses />} />
        <Route path="mechanism" element={<Mechanism />} />
        <Route path="assays" element={<Assays />} />
        <Route path="radar" element={<Radar />} />
        <Route path="power" element={<Power />} />
        <Route path="aims" element={<GrantAims />} />
        <Route path="suspension" element={<Suspension />} />
        <Route path="graph" element={<Graph />} />
        <Route path="theory" element={<Theory />} />
        <Route path="review" element={<Review />} />
        <Route path="protocol" element={<SrmaProtocol />} />
        <Route path="screening" element={<Screening />} />
        <Route path="prisma" element={<Prisma />} />
        <Route path="studies" element={<Studies />} />
        <Route path="rob" element={<Rob />} />
        <Route path="meta" element={<MetaAnalysis />} />
        <Route path="diagnostic" element={<DiagnosticMA />} />
        <Route path="references" element={<References />} />
        <Route path="artifacts" element={<Artifacts />} />
        <Route path="evidence" element={<EvidenceLibrary />} />
        <Route path="manuscript" element={<Manuscript />} />
        <Route path="poster" element={<Poster />} />
        <Route path="reviewers" element={<Reviewers />} />
        <Route path="shared/:id" element={<SharedImport />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
