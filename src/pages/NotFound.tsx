import { Link, useLocation } from 'react-router-dom'
import { Kicker, Rule } from '../components/ui'

// Catch-all for unknown hash routes — keeps the nav shell so a stale bookmark
// or typo lands somewhere navigable instead of a blank page.
export default function NotFound() {
  const loc = useLocation()
  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>route / 404</Kicker>
        <h1>This route isn’t on the grid</h1>
        <p>
          Nothing is mapped to <code className="inl">#{loc.pathname}</code>. It may have moved, or the
          link was mistyped. Pick a destination from the sidebar, or head back to the overview.
        </p>
      </div>
      <div className="card lg">
        <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />QUICK LINKS</div>
        <div className="wrap-gap">
          <Link className="btn primary sm" to="/">⌂ Overview</Link>
          <Link className="btn ghost sm" to="/pit-wall">Dashboard</Link>
          <Link className="btn ghost sm" to="/graph">Knowledge Graph</Link>
          <Link className="btn ghost sm" to="/meta">Meta-analysis</Link>
          <Link className="btn ghost sm" to="/theory">BrS Theory</Link>
        </div>
      </div>
    </>
  )
}
