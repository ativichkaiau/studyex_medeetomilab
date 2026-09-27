import type { CSSProperties } from 'react'
import { useDim } from '../lib/dimension'
import type { Reference } from '../lib/references'
import type { Review } from '../types'

/**
 * Solid things in CSS 3D — small signatures that stand a page's own numbers
 * up as objects: the reference library as books on a shelf, the PRISMA counts
 * as a stepped tower, research axes as columns. Each renders only in 3D
 * (signatures.css builds the faces), and each repeats what the page already
 * shows in text, so it is labelled for assistive tech and never the only way
 * to read anything.
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties

/** a stable number from a string, for giving each book its own proportions */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ---------- References: the library as a shelf ----------

export function Bookshelf({ refs, onPick }: { refs: Reference[]; onPick: (id: string) => void }) {
  const dim = useDim()
  if (dim !== '3d' || refs.length === 0) return null
  return (
    <div className="card lg shelf-card" data-no-tilt>
      <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />THE SHELF · {refs.length} VOLUME{refs.length === 1 ? '' : 'S'}</div>
      <div className="shelf-scene">
        <div className="shelf">
          <div className="shelf-row" role="list" aria-label="References as books; choose one to find it in the library below">
            {refs.map((r) => {
              const h = hash(r.id)
              return (
                <button
                  type="button"
                  role="listitem"
                  key={r.id}
                  className={`book k-${r.kind}`}
                  // longer titles make taller books; each spine its own thickness
                  style={vars({ '--h': `${148 + Math.min(62, Math.round(r.title.length / 3.5))}px`, '--t': `${30 + (h % 17)}px` })}
                  onClick={() => onPick(r.id)}
                  title={`${r.author}${r.year ? ` ${r.year}` : ''} — ${r.title}`}
                  aria-label={`${r.citeKey}: ${r.title}`}
                >
                  <span className="spine-key">@{r.citeKey}</span>
                  <span className="spine-year">{r.year || '—'}</span>
                </button>
              )
            })}
          </div>
          <div className="shelf-board" aria-hidden="true" />
        </div>
      </div>
      <p className="small" style={{ marginTop: 10 }}>Navy: knowledge-graph papers · teal: included studies · violet: both. Choose a book to find it in the library.</p>
    </div>
  )
}

// ---------- PRISMA: the records, stage by stage ----------

export function PrismaTower({ p }: { p: Review['prisma'] }) {
  const dim = useDim()
  if (dim !== '3d') return null
  const identified = p.dbRecords + p.otherRecords
  const ftOut = p.fullTextExcluded.reduce((a, x) => a + (x.n || 0), 0)
  const tiers = [
    { label: 'Identified', n: identified, out: p.duplicates, outLabel: 'duplicates' },
    { label: 'Screened', n: p.screened, out: p.excludedScreen, outLabel: 'excluded' },
    { label: 'Full text', n: p.fullText, out: ftOut, outLabel: 'excluded' },
    { label: 'Included', n: p.included, out: 0, outLabel: '' },
  ]
  const top = Math.max(1, ...tiers.map((t) => t.n))
  // area-honest widths (square root), never quite vanishing so an empty stage still reads
  const width = (n: number) => `${(16 + 84 * Math.sqrt(Math.max(0, n) / top)).toFixed(1)}%`
  const summary = tiers.map((t) => `${t.label} ${t.n}${t.out ? ` (${t.out} ${t.outLabel})` : ''}`).join(' → ')
  return (
    <div className="card lg tower-card" data-no-tilt>
      <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />RECORDS, STAGE BY STAGE</div>
      <div className="tower-scene" role="img" aria-label={`PRISMA counts as a stepped tower: ${summary}.`}>
        <div className="tower">
          {tiers.map((t, i) => (
            <div className={`tier t${i}`} key={t.label} style={vars({ '--i': i })}>
              <div className="solid keep" style={{ width: width(t.n) }}>
                <b>{t.n.toLocaleString()}</b><span>{t.label}</span>
              </div>
              {t.out > 0 && (
                <div className="solid out" style={{ width: width(t.out) }}>
                  <b>{t.out.toLocaleString()}</b><span>{t.outLabel}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="small">Widths are proportional in area to each count; red slabs are the records set aside at that stage.{identified === 0 ? ' Enter your counts and the tower builds itself.' : ''}</p>
    </div>
  )
}

// ---------- Dashboard: research axes as columns ----------

export function AxisColumns({ axes }: { axes: { name: string; total: number; done: number; pct: number }[] }) {
  const dim = useDim()
  if (dim !== '3d' || axes.length === 0) return null
  return (
    <div className="axis-cols" aria-hidden="true">
      {axes.slice(0, 8).map((a) => (
        <div className="axis-col" key={a.name} title={`${a.name}: ${a.done}/${a.total} done`}>
          <div className="column" style={vars({ '--pct': a.pct / 100 })}>
            <i className="fill" />
          </div>
          <span className="axis-col-label">{a.name}</span>
          <span className="axis-col-v">{a.done}/{a.total}</span>
        </div>
      ))}
    </div>
  )
}
