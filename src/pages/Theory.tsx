import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Kicker, Rule } from '../components/ui'
import { THEORY } from '../data/brsTheory'
import { REFS, citationUrl } from '../data/brsRefs'
import { QUIZ } from '../data/brsQuiz'
import { useReadSections } from '../lib/theoryProgress'
import { searchPubmed, type PubmedHit } from '../lib/pubmed'
import { useStore } from '../lib/store'
import { generateTheory, hasCuratedTheory } from '../lib/projectTheory'
import { hasKey, getModel } from '../lib/openai'
import { Markdown } from '../components/Markdown'
import { ProjectTabs } from '../components/ProjectTabs'
import { LivingTheory } from '../components/LivingTheory'
import { TraceableText } from '../components/Evidence'
import { Sk } from '../components/Skeleton'

// --- per-section citations + live "latest on PubMed" ---
function SectionCitations({ id }: { id: string }) {
  const data = REFS[id]
  const [hits, setHits] = useState<PubmedHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  if (!data) return null
  const refresh = async () => {
    setLoading(true)
    setErr('')
    try {
      setHits(await searchPubmed(data.query, 6, 'date'))
    } catch {
      setErr('Could not reach PubMed — try again shortly.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="cite-box">
      <div className="cite-h">References &amp; sources</div>
      <ul className="cite-list">
        {data.refs.map((c, i) => (
          <li key={i}>
            <a href={citationUrl(c)} target="_blank" rel="noreferrer">
              {c.cite}
              {c.pmid ? ` · PMID ${c.pmid}` : ''} ↗
            </a>
          </li>
        ))}
      </ul>
      <div className="cite-refresh">
        <button className="btn ghost sm" onClick={refresh} disabled={loading}>
          {loading ? 'Searching PubMed…' : '⟳ Latest on PubMed'}
        </button>
        <span className="small mono muted">query: {data.query}</span>
        {err && <span className="small" style={{ color: 'var(--red)' }}>{err}</span>}
      </div>
      {loading && <Sk kind="citations" />}
      {!loading && hits && hits.length > 0 && (
        <ul className="cite-list latest">
          {hits.map((h) => (
            <li key={h.pmid}>
              <a href={`https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`} target="_blank" rel="noreferrer">
                {h.title} — <i>{h.journal}{h.year ? ` · ${h.year}` : ''}</i> ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      {!loading && hits && hits.length === 0 && <p className="small empty">No recent results returned.</p>}
    </div>
  )
}

// --- self-check quiz ---
function QuizPanel({ onExit, onReview }: { onExit: () => void; onReview: (sectionId: string) => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const q = QUIZ[i]
  const pick = (idx: number) => {
    if (picked !== null) return
    setPicked(idx)
    if (idx === q.answer) setScore((s) => s + 1)
  }
  const next = () => {
    if (i + 1 >= QUIZ.length) return setDone(true)
    setI(i + 1)
    setPicked(null)
  }
  const retake = () => {
    setI(0)
    setPicked(null)
    setScore(0)
    setDone(false)
  }

  if (done) {
    const pct = score / QUIZ.length
    return (
      <div className="quiz-panel">
        <div className="quiz-done">
          <div className="quiz-score">{score} / {QUIZ.length}</div>
          <p>{pct === 1 ? 'Perfect — you own the sodium-current axis.' : pct >= 0.7 ? 'Strong. Revisit the ones you missed.' : 'Worth another pass through the theory.'}</p>
          <div className="wrap-gap" style={{ justifyContent: 'center' }}>
            <button className="btn primary sm" onClick={retake}>Retake</button>
            <button className="btn ghost sm" onClick={onExit}>Back to reading</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-panel">
      <div className="quiz-top">
        <span className="mono small">Question {i + 1} / {QUIZ.length}</span>
        <span className="mono small">Score {score}</span>
        <button className="btn ghost sm" onClick={onExit} style={{ marginLeft: 'auto' }}>Exit quiz</button>
      </div>
      <div className="quiz-track"><i style={{ width: `${(i / QUIZ.length) * 100}%` }} /></div>
      <h3 className="quiz-q">{q.q}</h3>
      <div className="quiz-opts">
        {q.options.map((o, idx) => {
          const cls = picked === null ? '' : idx === q.answer ? 'correct' : idx === picked ? 'wrong' : ''
          return (
            <button key={idx} className={`quiz-opt ${cls}`} onClick={() => pick(idx)} disabled={picked !== null}>
              {o}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className={`quiz-explain ${picked === q.answer ? 'ok' : 'no'}`}>
          <b>{picked === q.answer ? 'Correct. ' : 'Not quite. '}</b>
          {q.explain}
          <div className="wrap-gap" style={{ marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => onReview(q.sectionId)}>Review section →</button>
            <button className="btn primary sm" onClick={next}>{i + 1 >= QUIZ.length ? 'See score' : 'Next question'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Theory() {
  const { state } = useStore()
  return <ProjectTheoryPage key={state.project.id} />
}

function ProjectTheoryPage() {
  const { state, saveTheory } = useStore()
  const [focus, setFocus] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const curated = hasCuratedTheory(state.project)
  const draft = state.theory
  const sections = useMemo(() => curated ? THEORY : (draft?.sections ?? []).map((s) => ({ ...s, body: <Markdown text={s.body} /> })), [curated, draft])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function generate() {
    if (abortRef.current) return
    if (!hasKey()) {
      setError('Add your OpenAI key in Knowledge Review → Settings to generate theory.')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError('')
    try {
      const theory = await generateTheory(state, focus, controller.signal)
      if (!controller.signal.aborted) saveTheory(state.project.id, theory)
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Theory generation failed. Please try again.')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setGenerating(false)
      }
    }
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>PROJECT KNOWLEDGE · {state.project.code}</Kicker>
        <h1>Theory</h1>
        <p>{state.project.name}</p>
      </div>
      <ProjectTabs />
      <div className="theory-intro card lg rail">
        <div className="project-caption"><b>{state.project.code}</b><span className="pill">{curated ? 'Curated reference' : draft ? 'AI draft' : 'Ready to write'}</span></div>
        <h2>{curated ? 'Brugada Syndrome' : draft?.title || 'Build the foundation for this project'}</h2>
        <p>{curated
          ? 'The curated Brugada reference for this project: foundations, mechanisms, clinical features, and the epigenetic research frontier. Explore the sections, sources, and self-check quiz.'
          : draft?.summary || 'AI will write a theory chapter from this project’s topic, review question, PICO, hypotheses, and saved reference titles. The chapter and reading progress are saved with this project.'}</p>
        <div className="wrap-gap">
          <Link className="btn ghost sm" to="/review">Ask about this project →</Link>
          <Link className="btn ghost sm" to="/pit-wall">Dashboard →</Link>
          <Link className="btn ghost sm" to="/graph">Knowledge graph →</Link>
        </div>
      </div>

      {!curated && (
        <div className="card theory-generator" aria-busy={generating}>
          <div className="card-h"><span className="sq" />{draft ? 'REFINE THE THEORY' : 'WRITE WITH AI'}</div>
          {!draft && <p className="small">{state.review.question || state.project.centralHypothesis || 'Add a review question in Protocol for a more focused chapter, or start from the project title.'}</p>}
          <label className="fld">
            <span className="fld-l">Focus <span className="muted">· optional</span></span>
            <textarea className="textarea" rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} disabled={generating} placeholder="e.g. Explain the mechanisms, competing theories, and gaps behind our research question." />
          </label>
          <div className="wrap-gap">
            <button className="btn primary sm" onClick={generate} disabled={generating}>{generating ? 'Writing theory…' : draft ? 'Regenerate theory' : 'Generate theory'}</button>
            {generating && <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Cancel</button>}
            <span className="small muted">{getModel()}{draft ? ' · replaces the saved draft; Undo restores it' : ''}</span>
            {!hasKey() && <Link className="small" to="/review?settings=1">Add API key →</Link>}
          </div>
          {generating && <><Sk kind="theory" label={`Writing theory for ${state.project.code}`} /><p className="small">Leaving this page or switching projects cancels generation.</p></>}
          {error && <p className="theory-error" role="alert">{error}</p>}
          {draft && <p className="small muted">Saved {new Date(draft.generatedAt).toLocaleString()} · {draft.model}. AI draft — verify claims against primary sources.</p>}
        </div>
      )}

      <LivingTheory />
      {sections.length > 0 && <TheoryReader key={`${state.project.id}-${draft?.generatedAt ?? 'curated'}`} sections={sections} curated={curated} />}
      {!curated && draft && draft.sources.length > 0 && (
        <div className="card theory-sources">
          <div className="card-h">PROJECT REFERENCES SUPPLIED TO AI</div>
          <p className="small">Titles and identifiers were supplied as context. The model has not read the full papers.</p>
          <ul className="cite-list">{draft.sources.map((s) => {
            const url = s.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(s.pmid)}/` : s.doi ? `https://doi.org/${encodeURIComponent(s.doi)}` : null
            return <li key={s.id}>{url ? <a href={url} target="_blank" rel="noreferrer">{s.title} ↗</a> : s.title}{s.year ? ` · ${s.year}` : ''}</li>
          })}</ul>
        </div>
      )}
    </>
  )
}

function TheoryReader({ sections, curated }: { sections: { id: string; title: string; group: string; body: ReactNode }[]; curated: boolean }) {
  const { state } = useStore()
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [quiz, setQuiz] = useState(false)
  const [index, setIndex] = useState<Record<string, string>>({})
  const { read, toggle, clear } = useReadSections()

  const query = q.trim().toLowerCase()
  const matches = (s: (typeof sections)[number]) =>
    !query || (index[s.id] ?? `${s.title} ${s.group}`.toLowerCase()).includes(query)
  const visible = sections.filter(matches)

  // TOC groups, reflecting the current (possibly filtered) visible set
  const order: string[] = []
  const gmap = new Map<string, { id: string; title: string }[]>()
  visible.forEach((s) => {
    if (!gmap.has(s.group)) {
      gmap.set(s.group, [])
      order.push(s.group)
    }
    gmap.get(s.group)!.push({ id: s.id, title: s.title })
  })
  const groups = order.map((g) => ({ group: g, items: gmap.get(g)! }))

  const readCount = sections.filter((s) => read.has(s.id)).length
  const readPct = Math.round((readCount / sections.length) * 100)

  // build a full-text index over rendered bodies once, so search covers prose
  useEffect(() => {
    const idx: Record<string, string> = {}
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      idx[s.id] = `${s.title} ${s.group} ${el?.textContent ?? ''}`.toLowerCase()
    })
    setIndex(idx)
  }, [sections, state.theoryUpdates])

  // scroll-spy — re-observe whenever the rendered set changes
  useEffect(() => {
    if (quiz) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    visible.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, quiz, index, sections])

  const go = (id: string) => document.getElementById(id)?.scrollIntoView()

  return (
    <>
      {!quiz && (
        <div className="theory-controls">
          <input className="input" aria-label="Search theory" placeholder="Search the theory…" value={q} onChange={(e) => setQ(e.target.value)} />
          {query && <span className="small mono muted">{visible.length} section{visible.length === 1 ? '' : 's'}</span>}
          <div className="read-progress" title={`${readCount} of ${sections.length} sections marked read`}>
            <div className="rp-track"><i style={{ width: `${readPct}%` }} /></div>
            <span className="small mono">{readCount}/{sections.length} read</span>
          </div>
          {curated && <button className="btn primary sm" onClick={() => setQuiz(true)}>◎ Quiz mode</button>}
          {readCount > 0 && <button className="btn ghost sm" onClick={clear}>Reset</button>}
        </div>
      )}

      {quiz ? (
        <QuizPanel
          onExit={() => setQuiz(false)}
          onReview={(id) => {
            setQuiz(false)
            setQ('')
            setTimeout(() => go(id), 60)
          }}
        />
      ) : (
        <div className="theory">
          <nav className="theory-toc">
            {groups.map((g) => (
              <div key={g.group}>
                <div className="toc-group-h">{g.group}</div>
                {g.items.map((s) => (
                  <button
                    key={s.id}
                    className={`toc-link${active === s.id ? ' active' : ''}${read.has(s.id) ? ' read' : ''}`}
                    onClick={() => { setActive(s.id); go(s.id) }}
                  >
                    {read.has(s.id) && <span className="toc-tick">✓</span>}
                    {s.title}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="small empty">No matches.</p>}
          </nav>

          <div className="theory-body">
            {visible.map((s) => {
              const n = sections.findIndex((t) => t.id === s.id) + 1
              return (
                <section key={s.id} id={s.id} className={`theory-sec${active === s.id ? ' is-reading' : ''}`}>
                  <div className="sec-head">
                    <h2><span className="no">{String(n).padStart(2, '0')}</span>{s.title}</h2>
                    <button className={`read-toggle${read.has(s.id) ? ' on' : ''}`} onClick={() => toggle(s.id)}>
                      {read.has(s.id) ? '✓ Read' : 'Mark as read'}
                    </button>
                  </div>
                  <div className="prose"><TraceableText document="theory" sectionId={s.id}>{s.body}</TraceableText></div>
                  {state.theoryUpdates?.[s.id] && <div className="theory-evidence-update"><div className="small mono muted">REVIEWED EVIDENCE UPDATE</div><TraceableText document="theory" sectionId={`${s.id}:update`}><Markdown text={state.theoryUpdates[s.id]} /></TraceableText></div>}
                  {curated && <SectionCitations id={s.id} />}
                </section>
              )
            })}
            {visible.length === 0 && <p className="empty">No sections match “{q}”.</p>}
          </div>
        </div>
      )}
    </>
  )
}
