import { useState } from 'react'
import { useStore } from '../lib/store'
import { Link } from 'react-router-dom'
import { Kicker, Rule } from '../components/ui'

type ListKey = 'inclusion' | 'exclusion' | 'databases'

export default function SrmaProtocol() {
  const { state, updateReview } = useStore()
  const r = state.review
  const [editing, setEditing] = useState(false)

  const setPico = (k: 'p' | 'i' | 'c' | 'o', v: string) => updateReview({ pico: { ...r.pico, [k]: v } })
  const setItem = (key: ListKey, i: number, v: string) => updateReview({ [key]: r[key].map((x, idx) => (idx === i ? v : x)) })
  const addItem = (key: ListKey) => updateReview({ [key]: [...r[key], ''] })
  const delItem = (key: ListKey, i: number) => updateReview({ [key]: r[key].filter((_, idx) => idx !== i) })
  const setSearch = (i: number, patch: Partial<{ db: string; query: string }>) => updateReview({ searches: r.searches.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  const addSearch = () => updateReview({ searches: [...r.searches, { db: 'Database', query: '' }] })
  const delSearch = (i: number) => updateReview({ searches: r.searches.filter((_, idx) => idx !== i) })

  const PICO = [
    { k: 'p' as const, label: 'Population / model', c: 'var(--blue)' },
    { k: 'i' as const, label: 'Exposure', c: 'var(--violet)' },
    { k: 'c' as const, label: 'Comparator', c: 'var(--amber)' },
    { k: 'o' as const, label: 'Outcome', c: 'var(--green)' },
  ]

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Kicker>pipeline / 01 protocol · define</Kicker>
            <h1 style={{ marginTop: 12 }}>Review protocol</h1>
            {editing
              ? <textarea className="textarea" style={{ width: '100%', maxWidth: 900, fontWeight: 600 }} rows={2} value={r.title} onChange={(e) => updateReview({ title: e.target.value })} placeholder="Review title" />
              : <p>{r.title}</p>}
          </div>
          <button className={`btn sm ${editing ? 'primary' : 'ghost'}`} style={{ flex: 'none' }} onClick={() => setEditing((v) => !v)}>{editing ? '✓ Done' : '✎ Edit protocol'}</button>
        </div>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />REVIEW QUESTION</div>
          {editing
            ? <textarea className="textarea" style={{ width: '100%' }} rows={5} value={r.question} onChange={(e) => updateReview({ question: e.target.value })} placeholder="Primary review question (and any secondary questions)" />
            : <p className="hyp-quote">{r.question}</p>}
        </div>

        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />PECO</div>
          <div className="grid g4">
            {PICO.map((x) => (
              <div key={x.k} className="pico-cell" style={{ borderTopColor: x.c }}>
                <div className="pico-k" style={{ color: x.c }}>{x.label}</div>
                {editing
                  ? <textarea className="textarea" style={{ width: '100%', fontSize: 12.5 }} rows={6} value={r.pico[x.k]} onChange={(e) => setPico(x.k, e.target.value)} />
                  : <div className="pico-v">{r.pico[x.k]}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid g2">
          {(['inclusion', 'exclusion'] as const).map((key) => {
            const isInc = key === 'inclusion'
            const color = isInc ? 'var(--green)' : 'var(--red)'
            return (
              <div className="card lg" key={key}>
                <div className="card-h"><span className="sq" style={{ background: color }} />{isInc ? 'INCLUSION' : 'EXCLUSION'} CRITERIA</div>
                {r[key].map((c, i) => (
                  <div className="list-item" key={i} style={editing ? { alignItems: 'center', gap: 8 } : undefined}>
                    <span className="ic" style={{ color }}>{isInc ? '✓' : '✕'}</span>
                    {editing
                      ? <>
                          <input className="input" style={{ flex: 1 }} value={c} onChange={(e) => setItem(key, i, e.target.value)} />
                          <button className="icon-btn danger" onClick={() => delItem(key, i)} title="Remove">✕</button>
                        </>
                      : <span>{c}</span>}
                  </div>
                ))}
                {editing && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => addItem(key)}>＋ Add criterion</button>}
                {!editing && r[key].length === 0 && <p className="empty">None specified.</p>}
              </div>
            )
          })}
        </div>

        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />SEARCH STRATEGY</div>
          <div className="wrap-gap" style={{ marginBottom: 12, alignItems: 'center' }}>
            {r.databases.map((d, i) => (
              editing
                ? <span key={i} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
                    <input className="input" style={{ width: 150, padding: '3px 7px', fontSize: 11 }} value={d} onChange={(e) => setItem('databases', i, e.target.value)} />
                    <button className="sc-x" onClick={() => delItem('databases', i)} title="Remove database">✕</button>
                  </span>
                : <span className="pill" key={i}>{d}</span>
            ))}
            {editing && <button className="chip-btn" onClick={() => addItem('databases')}>＋ Database</button>}
          </div>
          {r.searches.map((s, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              {editing
                ? <div className="flex" style={{ gap: 8, marginBottom: 4, alignItems: 'center' }}>
                    <input className="input mono" style={{ width: 200, fontSize: 11 }} value={s.db} onChange={(e) => setSearch(i, { db: e.target.value })} placeholder="database" />
                    <button className="icon-btn danger" onClick={() => delSearch(i)} title="Remove strategy">✕</button>
                  </div>
                : <div className="small mono" style={{ marginBottom: 4, color: 'var(--muted)' }}>{s.db}</div>}
              {editing
                ? <textarea className="textarea mono" style={{ width: '100%', fontSize: 11.5, lineHeight: 1.5 }} rows={5} value={s.query} onChange={(e) => setSearch(i, { query: e.target.value })} placeholder="Full search string…" />
                : <pre className="query">{s.query}</pre>}
            </div>
          ))}
          {editing && <button className="btn ghost sm" onClick={addSearch}>＋ Add search strategy</button>}
        </div>

        <div className="grid g2">
          <div className="card lg">
            <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />REGISTRATION &amp; METHODS</div>
            <div className="kv"><span className="k">Registration</span><input className="input" aria-label="Review registration identifier" style={{ maxWidth: 320 }} value={r.registration ?? ''} onChange={(e) => updateReview({ registration: e.target.value })} placeholder="PROSPERO CRD…" /></div>
            <div className="kv"><span className="k">Effect measure</span><span className="val">{r.effect} · {r.indexLabel} vs {r.comparatorLabel} <span className="small muted">(set on Meta-analysis)</span></span></div>
            <div className="kv"><span className="k">Synthesis</span><span className="val">Inverse-variance {r.model}-effects; heterogeneity by I² / τ²</span></div>
            <div className="kv"><span className="k">Risk of bias</span><span className="val">{r.robTool ? <><b>{r.robTool}</b> — </> : null}{r.robDomains.join(', ')}</span></div>
            <div className="kv"><span className="k">Reporting</span><span className="val">PRISMA 2020</span></div>
          </div>
          <div className="card lg rail">
            <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />SCREENING</div>
            <p className="small" style={{ marginBottom: 12 }}>Screen records and resolve conflicts in this project. Decisions feed the screening log and are checked against PRISMA counts.</p>
            <Link className="btn primary" to="/screening">Open screening →</Link>
            {r.screenerUrl && <p className="small mono" style={{ marginTop: 10, wordBreak: 'break-all' }}>External screener: <a href={r.screenerUrl} target="_blank" rel="noreferrer">{r.screenerUrl}</a></p>}
          </div>
        </div>
      </div>
    </>
  )
}
