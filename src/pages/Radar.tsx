import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker } from '../components/ui'
import EvidenceRegistry from '../components/EvidenceRegistry'
import { Sk } from '../components/Skeleton'
import RadarScope, { type ScopeContact } from '../components/RadarScope'
import { searchPubmed, type PubmedHit } from '../lib/pubmed'
import { searchSources, crossrefByDoi, ALL_SOURCES, type SourceHit, type SourceName } from '../lib/sources'
import { complete, parseJsonLoose, hasKey, getModel, type JsonSchemaResponseFormat } from '../lib/openai'
import { listSearches, saveSearch, recordRun, removeSearch, findSearch, type SavedSearch } from '../lib/savedSearches'
import { taStatus, advanced } from '../lib/screening'
import type { ScreenRecord } from '../types'

const srUid = () => (crypto.randomUUID ? crypto.randomUUID() : `sr_${Date.now()}_${Math.random().toString(36).slice(2)}`)

const STANCE_CLASS: Record<string, string> = {
  supports: 'b-supported',
  refutes: 'b-refuted',
  background: 'b-draft',
}

type Verdict = 'include' | 'maybe' | 'exclude'
const VERDICT_CLASS: Record<Verdict, string> = { include: 'v-include', maybe: 'v-maybe', exclude: 'v-exclude' }

const TRIAGE_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'literature_triage',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pmid: { type: 'string' },
              verdict: { type: 'string', enum: ['include', 'maybe', 'exclude'] },
              reason: { type: 'string' },
            },
            required: ['pmid', 'verdict', 'reason'],
          },
        },
      },
      required: ['results'],
    },
  },
}

const SRC_COLOR: Record<SourceName, string> = { PubMed: '#3b5ff0', 'Europe PMC': '#23766f', CrossRef: '#94650f', 'ClinicalTrials.gov': '#5f54b8' }
const SRC_ABBR: Record<SourceName, string> = { PubMed: 'PM', 'Europe PMC': 'EPMC', CrossRef: 'CR', 'ClinicalTrials.gov': 'CT' }

function firstAuthorSurname(authors?: string): string {
  if (!authors) return 'Unknown'
  const first = authors.split(/[,;]/)[0].trim()
  return first.split(/\s+/)[0] || 'Unknown'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeVerdict(value: unknown): Verdict | null {
  if (typeof value !== 'string') return null
  switch (value.trim().toLowerCase().replace(/[^a-z]/g, '')) {
    case 'include':
    case 'included':
      return 'include'
    case 'maybe':
    case 'uncertain':
    case 'unclear':
      return 'maybe'
    case 'exclude':
    case 'excluded':
      return 'exclude'
    default:
      return null
  }
}

function parseTriageResponse(text: string, knownPmids: ReadonlySet<string>): Record<string, { verdict: Verdict; reason: string }> {
  const parsed = parseJsonLoose<unknown>(text)
  let rows: unknown[] = []
  if (Array.isArray(parsed)) rows = parsed
  else if (isRecord(parsed)) {
    for (const key of ['results', 'triage', 'items']) {
      if (Array.isArray(parsed[key])) {
        rows = parsed[key]
        break
      }
    }
  }

  const map: Record<string, { verdict: Verdict; reason: string }> = {}
  for (const row of rows) {
    if (!isRecord(row)) continue
    const rawPmid = row.pmid
    const pmid = (typeof rawPmid === 'string' || typeof rawPmid === 'number')
      ? String(rawPmid).trim().replace(/^pmid\s+/i, '')
      : ''
    const verdict = normalizeVerdict(row.verdict)
    if (!pmid || !knownPmids.has(pmid) || !verdict) continue
    const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : 'No reason provided.'
    map[pmid] = { verdict, reason }
  }

  if (!Object.keys(map).length) throw new Error('The model returned no usable screening decisions.')
  return map
}

export default function Radar() {
  const { state, addPaper, removePaper, addStudy, updateReview } = useStore()
  const hypLabel = (id: string) => state.hypotheses.find((h) => h.id === id)?.label.split('·')[0].trim() ?? id
  const gaps = state.hypotheses.filter((h) => !h.supportingPapers || h.supportingPapers.length === 0)

  const [query, setQuery] = useState('Brugada syndrome SCN5A methylation')
  const [hits, setHits] = useState<PubmedHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<SavedSearch[]>([])
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [triage, setTriage] = useState<Record<string, { verdict: Verdict; reason: string }>>({})
  const [triaging, setTriaging] = useState(false)
  const [living, setLiving] = useState<{ running: boolean; ran: boolean; newHits: (PubmedHit & { search: string })[] }>({ running: false, ran: false, newHits: [] })

  // ---- multi-source search (Europe PMC · CrossRef · ClinicalTrials.gov) ----
  const [msQuery, setMsQuery] = useState('Brugada syndrome ajmaline diagnostic accuracy')
  const [msSources, setMsSources] = useState<Set<SourceName>>(() => new Set(ALL_SOURCES))
  const [msHits, setMsHits] = useState<SourceHit[]>([])
  const [msMeta, setMsMeta] = useState<{ rawCount: number; perSource: Record<string, number>; errors: { source: SourceName; msg: string }[] } | null>(null)
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState<string | null>(null)
  const [doi, setDoi] = useState('')
  const [doiBusy, setDoiBusy] = useState(false)
  const [doiMsg, setDoiMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => setSaved(listSearches()), [])

  // ---- living review: re-run every saved search, surface what's new ----
  const screening = state.review.screening ?? []
  const pendingToScreen = screening.filter((s) => taStatus(s) === 'pending').length
  const includedN = advanced(screening).filter((s) => s.ft === 'include').length

  async function runLiving() {
    const searches = listSearches()
    if (!searches.length) return
    setLiving({ running: true, ran: false, newHits: [] })
    const all: (PubmedHit & { search: string })[] = []
    for (const s of searches) {
      try {
        const res = await searchPubmed(s.query, 25, 'date')
        const freshSet = recordRun(s.query, res.map((h) => h.pmid), Date.now())
        res.filter((h) => freshSet.has(h.pmid)).forEach((h) => all.push({ ...h, search: s.query }))
      } catch {
        /* skip a failed search, keep going */
      }
    }
    setLiving({ running: false, ran: true, newHits: all })
    setSaved(listSearches())
  }

  function addNewToScreening() {
    const existing = new Set(screening.map((s) => s.pmid))
    const fresh: ScreenRecord[] = living.newHits
      .filter((h) => !existing.has(h.pmid))
      .map((h) => ({ id: srUid(), pmid: h.pmid, title: h.title, journal: h.journal, year: h.year, authors: h.authors }))
    if (fresh.length) updateReview({ screening: [...screening, ...fresh] })
    setLiving({ ...living, newHits: [] })
  }

  const paperId = (pmid: string) => `paper_pmid_${pmid}`
  const isAdded = (pmid: string) => state.papers.some((p) => p.id === paperId(pmid))
  const inStudies = (pmid: string) => state.review.studies.some((s) => s.pmid === pmid)

  function toggleSource(s: SourceName) {
    setMsSources((prev) => {
      const n = new Set(prev)
      if (n.has(s)) n.delete(s)
      else n.add(s)
      return n
    })
  }
  async function runMulti() {
    const srcs = ALL_SOURCES.filter((s) => msSources.has(s))
    if (!srcs.length) { setMsError('Select at least one source.'); return }
    setMsLoading(true); setMsError(null); setMsMeta(null)
    try {
      const r = await searchSources(msQuery, srcs, 20)
      setMsHits(r.hits)
      setMsMeta({ rawCount: r.rawCount, perSource: r.perSource, errors: r.errors })
      if (!r.hits.length) setMsError('No results across the selected sources.')
    } catch (e) {
      setMsError(e instanceof Error ? e.message : 'Multi-source search failed.')
    } finally {
      setMsLoading(false)
    }
  }
  // a source hit is "known" if its PMID matches, or its title already appears in a study note
  function sourceInStudies(h: SourceHit): boolean {
    return state.review.studies.some((s) => (h.pmid && s.pmid === h.pmid) || (!!s.note && s.note.toLowerCase().includes(h.title.toLowerCase().slice(0, 40))))
  }
  function sourceToStudies(h: SourceHit): 'added' | 'dup' {
    if (sourceInStudies(h)) return 'dup'
    addStudy({ author: firstAuthorSurname(h.authors), year: h.year ?? new Date().getFullYear(), pmid: h.pmid, include: false, note: `${h.title}${h.journal ? ' — ' + h.journal : ''}${h.doi ? ' · doi:' + h.doi : ''}${h.nctId ? ' · ' + h.nctId : ''}` })
    return 'added'
  }
  async function runDoi() {
    const d = doi.trim()
    if (!d) return
    setDoiBusy(true); setDoiMsg(null)
    try {
      const hit = await crossrefByDoi(d)
      if (!hit) { setDoiMsg({ ok: false, text: 'No CrossRef record for that DOI.' }); return }
      const r = sourceToStudies(hit)
      setDoiMsg({ ok: true, text: `${r === 'dup' ? 'Already in Studies' : '✓ Added to Studies'}: ${firstAuthorSurname(hit.authors)} ${hit.year ?? ''} — ${hit.title.slice(0, 64)}${hit.title.length > 64 ? '…' : ''}` })
      if (r === 'added') setDoi('')
    } catch (e) {
      setDoiMsg({ ok: false, text: e instanceof Error ? e.message : 'DOI lookup failed.' })
    } finally {
      setDoiBusy(false)
    }
  }
  const isSaved = !!findSearch(query)

  async function run(q = query) {
    setQuery(q)
    setLoading(true)
    setError(null)
    setTriage({})
    try {
      const res = await searchPubmed(q, 20)
      setHits(res)
      setFresh(recordRun(q, res.map((h) => h.pmid), Date.now()))
      setSaved(listSearches())
      if (res.length === 0) setError('No results for that query.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PubMed request failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function saveCurrent() {
    saveSearch(query, hits.map((h) => h.pmid), Date.now())
    setSaved(listSearches())
    setFresh(new Set())
  }
  function drop(id: string) {
    removeSearch(id)
    setSaved(listSearches())
  }

  function add(h: PubmedHit) {
    addPaper(
      { id: paperId(h.pmid), pmid: h.pmid, doi: h.doi, title: h.title, authors: h.authors, journal: h.journal, year: h.year, stance: 'background', tags: h.journal ? [h.journal] : [] },
      links[h.pmid] || undefined,
    )
  }
  function toStudies(h: PubmedHit) {
    if (inStudies(h.pmid)) return
    addStudy({ author: firstAuthorSurname(h.authors), year: h.year ?? new Date().getFullYear(), pmid: h.pmid, include: false, note: `${h.title}${h.journal ? ' — ' + h.journal : ''}` })
  }

  async function runTriage() {
    if (!hasKey()) {
      setError('Terra is off — add an OpenAI key in Knowledge review → Settings to triage.')
      return
    }
    if (!hits.length) return
    setTriaging(true)
    setError(null)
    try {
      const list = hits.map((h) => `PMID ${h.pmid}: ${h.title} — ${h.journal ?? ''} ${h.year ?? ''}`).join('\n')
      const text = await complete(
        [
          { role: 'system', content: 'You are a systematic-review screening assistant. Return only JSON matching the supplied schema.' },
          {
            role: 'user',
            content: `Systematic review question: "${state.review.question}"\nPICO — population: ${state.review.pico.p}; intervention/exposure: ${state.review.pico.i}; comparator: ${state.review.pico.c}; outcome: ${state.review.pico.o}\n\nFor EACH paper below, judge screening relevance as "include", "maybe" or "exclude" and give a reason of at most 12 words. Return an object with a "results" array: {"results":[{"pmid":"12345","verdict":"include|maybe|exclude","reason":"…"}]}.\n\n${list}`,
          },
        ],
        getModel(),
        undefined,
        TRIAGE_RESPONSE_FORMAT,
      )
      setTriage(parseTriageResponse(text, new Set(hits.map((h) => h.pmid))))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      setError(message ? `AI triage failed: ${message}` : 'Terra triage failed — the model returned an unexpected format. Try again.')
    } finally {
      setTriaging(false)
    }
  }

  const triagedIncludes = hits.filter((h) => triage[h.pmid]?.verdict === 'include' && !inStudies(h.pmid))
  function sendAllIncludes() {
    triagedIncludes.forEach(toStudies)
  }

  // every result from every search on this page, as radar contacts (3D only);
  // keys are the ids of their rows below, so a contact can point at its row
  const contacts = useMemo(() => {
    const out: ScopeContact[] = []
    const seenPmids = new Set<string>()
    for (const h of hits) {
      seenPmids.add(h.pmid)
      out.push({ key: `hit-${h.pmid}`, title: h.title, year: h.year, source: 'PubMed', verdict: triage[h.pmid]?.verdict, fresh: fresh.has(h.pmid) })
    }
    // the living list shows its first 12, so the scope does too — every blip has a row
    for (const h of living.newHits.slice(0, 12)) {
      if (seenPmids.has(h.pmid)) continue
      seenPmids.add(h.pmid)
      out.push({ key: `lhit-${h.pmid}`, title: h.title, year: h.year, source: 'PubMed', fresh: true })
    }
    for (const h of msHits) {
      if (h.pmid && seenPmids.has(h.pmid)) continue
      out.push({ key: `mhit-${h.key}`, title: h.title, year: h.year, source: h.sources[0] ?? 'PubMed' })
    }
    return out
  }, [hits, triage, fresh, living.newHits, msHits])
  const findContact = (id: string) => {
    const row = document.getElementById(id)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    row.classList.remove('flash')
    void row.offsetWidth
    row.classList.add('flash')
  }

  return (
    <>
      <div className="page-head">
        <Kicker>pipeline / 02 literature · ingest</Kicker>
        <h1>Literature</h1>
        <p>The project's evidence registry, and the searches that feed it: PubMed live, Europe PMC, Crossref and trial registries, triage, and a living review that flags what's new since the last run.</p>
      </div>

      <EvidenceRegistry />
      <div className="sec-label">ingest · search &amp; triage</div>

      <RadarScope contacts={contacts} sources={ALL_SOURCES} onPick={findContact} />

      <div className="card lg rail" style={{ marginBottom: 16, ['--rail' as string]: 'var(--green)' } as CSSProperties}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span><span className="sq" style={{ background: 'var(--green)' }} />LIVING REVIEW</span>
          <button className="btn primary sm" onClick={runLiving} disabled={living.running || saved.length === 0}>{living.running ? 'Re-running…' : `⟳ Re-run ${saved.length} saved search${saved.length === 1 ? '' : 'es'}`}</button>
        </div>
        {saved.length === 0 ? (
          <p className="small">Save a search below (☆) to track it. The living review re-runs all saved searches and flags anything published since you last looked.</p>
        ) : (
          <>
            <div className="lr-stats">
              <span className="lr-stat"><b>{saved.length}</b> saved search{saved.length === 1 ? '' : 'es'}</span>
              <span className="lr-stat"><b>{pendingToScreen}</b> to screen</span>
              <span className="lr-stat"><b>{includedN}</b> included</span>
              <span className="lr-stat"><b>{state.review.studies.length}</b> in extraction</span>
              <span className="spacer" />
              <Link className="small" to="/screening">Open screening →</Link>
            </div>
            {living.running && <Sk kind="hits" label="Re-running saved searches" />}
            {living.ran && (
              living.newHits.length === 0 ? (
                <p className="small" style={{ color: 'var(--green)', marginTop: 10 }}>✓ Up to date — no new results across your saved searches.</p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div className="flex" style={{ marginBottom: 8 }}>
                    <b>{living.newHits.length} new result{living.newHits.length === 1 ? '' : 's'} since last run</b>
                    <span className="spacer" />
                    <button className="btn ghost sm" onClick={addNewToScreening}>→ Add all to Screening</button>
                  </div>
                  {living.newHits.slice(0, 12).map((h) => (
                    <div key={h.pmid} id={`lhit-${h.pmid}`} className="stint" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="nm"><span className="new-dot">NEW</span>{h.title}</div>
                        <div className="meta">{h.journal ?? '—'} {h.year ?? ''} · <a href={`https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`} target="_blank" rel="noreferrer">PMID {h.pmid} ↗</a> · from “{h.search.length > 40 ? h.search.slice(0, 38) + '…' : h.search}”</div>
                      </div>
                    </div>
                  ))}
                  {living.newHits.length > 12 && <p className="small" style={{ marginTop: 6 }}>+{living.newHits.length - 12} more.</p>}
                </div>
              )
            )}
          </>
        )}
      </div>

      <div className="card lg" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />SEARCH PUBMED (E-UTILITIES)</div>
        <div className="flex" style={{ gap: 10 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="e.g. SCN10A enhancer cardiac conduction"
          />
          <button className="btn primary" onClick={() => run()} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>

        {(saved.length > 0 || hits.length > 0) && (
          <div className="saved-row">
            {hits.length > 0 && !isSaved && <button className="chip-btn" onClick={saveCurrent} title="Save this query to track new results">☆ Save search</button>}
            {saved.map((s) => (
              <span key={s.id} className={`saved-chip${findSearch(query) && s.query === query ? ' active' : ''}`}>
                <button className="sc-run" onClick={() => run(s.query)} title={`Last run ${new Date(s.lastRun).toLocaleDateString()}`}>★ {s.query.length > 34 ? s.query.slice(0, 32) + '…' : s.query}</button>
                <button className="sc-x" onClick={() => drop(s.id)} title="Remove saved search">✕</button>
              </span>
            ))}
          </div>
        )}

        {error && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

        {loading && <Sk kind="hits" />}
        {!loading && hits.length > 0 && (
          <>
            <div className="flex" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn ghost sm" onClick={runTriage} disabled={triaging}>{triaging ? 'Triaging…' : 'terra · relevance triage'}</button>
              {triagedIncludes.length > 0 && <button className="btn primary sm" onClick={sendAllIncludes}>→ Send {triagedIncludes.length} "include" to Studies</button>}
              {triaging && <span className="sr-only" role="status">Triaging relevance…</span>}
              {fresh.size > 0 && <span className="pill" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>{fresh.size} new since last run</span>}
              <span className="small mono muted" style={{ marginLeft: 'auto' }}>{hits.length} hits</span>
            </div>

            <div style={{ marginTop: 12 }}>
              {hits.map((h) => {
                const tv = triage[h.pmid]
                return (
                  <div key={h.pmid} id={`hit-${h.pmid}`} className="stint" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nm">
                        {fresh.has(h.pmid) && <span className="new-dot" title="New since last run">NEW</span>}
                        {tv ? <span className={`vbadge ${VERDICT_CLASS[tv.verdict]}`} title={tv.reason}>{tv.verdict}</span> : triaging && <span className="vbadge sk-vbadge" aria-hidden="true" />}
                        {h.title}
                      </div>
                      <div className="meta">
                        {h.authors || 'Unknown authors'} · {h.journal ?? '—'} {h.year ?? ''} · <a href={`https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`} target="_blank" rel="noreferrer">PMID {h.pmid} ↗</a>
                        {tv ? ` · ${tv.reason}` : ''}
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 8, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <select className="select" style={{ width: 138 }} value={links[h.pmid] ?? ''} onChange={(e) => setLinks((l) => ({ ...l, [h.pmid]: e.target.value }))}>
                        <option value="">link to…</option>
                        {state.hypotheses.map((hy) => (
                          <option key={hy.id} value={hy.id}>{hypLabel(hy.id)}</option>
                        ))}
                      </select>
                      <button className="btn ghost sm" onClick={() => add(h)} disabled={isAdded(h.pmid)}>{isAdded(h.pmid) ? 'On graph ✓' : '+ Graph'}</button>
                      <button className="btn ghost sm" onClick={() => toStudies(h)} disabled={inStudies(h.pmid)} title="Add to the SRMA extraction table">{inStudies(h.pmid) ? 'In Studies ✓' : '→ Studies'}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="card lg rail" style={{ marginBottom: 16, ['--rail' as string]: 'var(--violet, #5f54b8)' } as CSSProperties}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--violet, #5f54b8)' }} />MULTI-SOURCE SEARCH · EUROPE PMC · CROSSREF · TRIALS</div>
        <p className="small" style={{ marginTop: -4, marginBottom: 12 }}>Search several databases at once and fuzzy-de-duplicate the union (by DOI, PMID, then near-identical title). Everything runs in your browser — no proxy, no key.</p>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {ALL_SOURCES.map((s) => (
            <button key={s} className={`chip-btn${msSources.has(s) ? ' active' : ''}`} onClick={() => toggleSource(s)} style={msSources.has(s) ? { borderColor: SRC_COLOR[s], color: SRC_COLOR[s] } : undefined} title={msSources.has(s) ? 'Included — click to exclude' : 'Excluded — click to include'}>
              {msSources.has(s) ? '✓ ' : ''}{s}
            </button>
          ))}
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <input className="input" value={msQuery} onChange={(e) => setMsQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMulti()} placeholder="e.g. Brugada ajmaline diagnostic accuracy" />
          <button className="btn primary" onClick={runMulti} disabled={msLoading}>{msLoading ? 'Searching…' : 'Search all'}</button>
        </div>

        <div className="flex" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small mono muted">DOI auto-fill →</span>
          <input className="input" style={{ maxWidth: 280 }} value={doi} onChange={(e) => setDoi(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runDoi()} placeholder="10.1093/europace/euz122" />
          <button className="btn ghost sm" onClick={runDoi} disabled={doiBusy || !doi.trim()}>{doiBusy ? 'Looking up…' : '＋ Fetch & add to Studies'}</button>
          {doiMsg && <span className="small" style={{ color: doiMsg.ok ? 'var(--green)' : 'var(--red)' }}>{doiMsg.text}</span>}
        </div>

        {msError && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{msError}</div>}
        {msLoading && <Sk kind="sources" parts={ALL_SOURCES.filter((s) => msSources.has(s))} />}

        {msMeta && msHits.length > 0 && (
          <>
            <div className="flex" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill" style={{ borderColor: 'var(--violet, #5f54b8)', color: 'var(--violet, #5f54b8)' }}>{msHits.length} unique</span>
              {msMeta.rawCount > msHits.length && <span className="small muted">{msMeta.rawCount - msHits.length} duplicate{msMeta.rawCount - msHits.length === 1 ? '' : 's'} merged</span>}
              <span className="small mono muted" style={{ marginLeft: 'auto' }}>{ALL_SOURCES.filter((s) => msMeta.perSource[s] != null).map((s) => `${s} ${msMeta.perSource[s]}`).join(' · ')}</span>
            </div>
            {msMeta.errors.length > 0 && <p className="small" style={{ color: 'var(--amber)', marginTop: 6 }}>⚠ {msMeta.errors.map((e) => `${e.source}: ${e.msg}`).join('; ')}</p>}
            <div style={{ marginTop: 12 }}>
              {msHits.map((h) => (
                <div key={h.key} id={`mhit-${h.key}`} className="stint" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">
                      {h.sources.map((s) => <span key={s} className="src-badge" style={{ background: SRC_COLOR[s] }} title={s}>{SRC_ABBR[s]}</span>)}
                      {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a> : h.title}
                    </div>
                    <div className="meta">
                      {h.authors || (h.nctId ? 'Clinical trial' : 'Unknown authors')} · {h.journal ?? '—'} {h.year ?? ''}
                      {h.pmid ? <> · PMID {h.pmid}</> : ''}{h.doi ? <> · <span className="mono">{h.doi}</span></> : ''}{h.nctId ? <> · {h.nctId}</> : ''}
                    </div>
                  </div>
                  <div className="flex" style={{ gap: 8, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn ghost sm" onClick={() => sourceToStudies(h)} disabled={sourceInStudies(h)} title="Add to the SRMA extraction table">{sourceInStudies(h) ? 'In Studies ✓' : '→ Studies'}</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="graph-wrap">
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Year</th>
                <th>Stance</th>
                <th>Targets</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.papers.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.title}</b><div className="small mono">{p.pmid ? `PMID ${p.pmid}` : 'PMID —'}{p.doi ? ` · ${p.doi}` : ''}</div></td>
                  <td className="mono">{p.year ?? '—'}</td>
                  <td><span className={`badge ${STANCE_CLASS[p.stance ?? 'background']}`}>{p.stance ?? 'background'}</span></td>
                  <td className="wrap-gap">{(p.targets ?? []).map((t) => <span className="chip" key={t}>{hypLabel(t)}</span>)}</td>
                  <td><button className="icon-btn danger" onClick={() => removePaper(p.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card note">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />GAP MAP</div>
          {gaps.length === 0 ? (
            <p className="empty">Every hypothesis has literature on record.</p>
          ) : (
            <>
              <p className="small" style={{ marginBottom: 10 }}>Hypotheses with no supporting reference — search above and link one:</p>
              {gaps.map((h) => (
                <div className="list-item" key={h.id}>
                  <span className="ic" style={{ color: 'var(--amber)' }}>▲</span>
                  <span>{h.label}</span>
                </div>
              ))}
            </>
          )}
          <div className="divider" />
          <p className="small">Hits marked <b>→ Studies</b> land in the <Link to="/studies">extraction table</Link> for 2×2 coding. Live via NCBI E-utilities (CORS, ~3 req/s).</p>
        </div>
      </div>
    </>
  )
}
