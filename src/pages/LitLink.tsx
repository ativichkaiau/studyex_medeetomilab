import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSwapNavigate } from '../lib/swap'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { useLitLink, cohortStats, exportCohortMd, PHASES, OUTCOME_META, type LitGroup, type GroupOutcome, type PhaseStatus } from '../lib/litlink'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const STATUS_LABEL: Record<PhaseStatus, string> = { 'not-started': 'Not started', active: 'Active', done: 'Done' }
const STATUS_COLOR: Record<PhaseStatus, string> = { 'not-started': 'var(--text-muted)', active: 'var(--research)', done: 'var(--success)' }

export default function LitLink() {
  const ll = useLitLink()
  const { state } = ll
  const stats = cohortStats(state)
  const [selected, setSelected] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const group = state.groups.find((g) => g.id === selected) ?? null

  if (group) return <GroupDetail group={group} ll={ll} onBack={() => setSelected(null)} />

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>program / litlink</Kicker>
            <h1 style={{ marginTop: 12 }}>LitLink</h1>
            <p>Groups of 3–4 น้อง, each with a <b>Mentor</b> and an <b>ACAD</b>, build from foundations to a focused review — ending in a Research Question, a Reflection, or a supported step-out. Track every group across the three phases.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setAbout((a) => !a)}>{about ? 'Hide' : 'About the program'}</button>
            <button className="btn ghost sm" onClick={() => download(exportCohortMd(state), `${(state.cohort || 'litlink').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, 'text/markdown')} disabled={!state.groups.length} title="Mentor-facing report: group summaries + reflections">⤓ Export cohort</button>
            <button className="btn primary sm" onClick={() => { const id = ll.addGroup(''); setSelected(id) }}>＋ Add group</button>
          </div>
        </div>
      </div>

      {about && (
        <div className="card lg rail" style={{ marginBottom: 16 }}>
          <div className="card-h"><span className="sq" style={{ background: 'var(--research)' }} />WHY LITLINK WORKS THIS WAY</div>
          <div className="grid g2">
            <div>
              <p className="small"><b>Last year's problems.</b></p>
              <ul className="small">
                <li>Findings went nowhere — no path into real research, and some groups dropped out.</li>
                <li>Heavy work done <i>just to present</i>, with little benefit back to the student.</li>
              </ul>
            </div>
            <div>
              <p className="small"><b>The fix.</b></p>
              <ul className="small">
                <li><b>Foundations first</b> — build base knowledge before the specific topic: more flexible with professors, useful for coursework, and better questions (a Research Question = one current knowledge can't yet answer).</li>
                <li><b>Flexible endpoint</b> — a Research Question isn't mandatory; a group can pivot to a <b>Reflection</b> on their process.</li>
                <li><b>Supported drop-out</b> — stepping out is OK, with the Mentor's help.</li>
              </ul>
            </div>
          </div>
          <div className="divider" />
          <p className="small"><b>Roles.</b> Each group of 3–4 น้อง has a <b>Mentor</b> (advice, feedback, information, lit-review & research support) and an <b>ACAD</b> (the liaison between the research side and the group + mentor — facilitates scheduling and may join the review). Duties are split across the three phases below.</p>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatCard value={stats.groups} label="Active groups" sub={`${state.cohort}`} tone="var(--research)" />
        <StatCard value={stats.members} label="น้อง (juniors)" sub={`${(stats.members / Math.max(1, stats.groups)).toFixed(1)} per group`} tone="var(--accent)" />
        <StatCard value={stats.completed} label="Reached an outcome" sub={`${stats.outcomes['research-question']} RQ · ${stats.outcomes.reflection} reflection`} tone="var(--success)" />
        <StatCard value={stats.outcomes.dropped} label="Stepped out" sub="supported, no penalty" tone="var(--warning)" />
      </div>

      {/* phase pipeline */}
      <div className="grid g3 lit-phases" style={{ marginBottom: 16 }}>
        {PHASES.map((p, i) => (
          <div className="card lg" key={p.key} style={{ borderTop: `3px solid ${p.accent}` }}>
            <div className="card-h" style={{ justifyContent: 'space-between' }}>
              <span><span className="sq" style={{ background: p.accent }} />PHASE {p.n} · {p.title.toUpperCase()}</span>
              <span className="pill" style={{ borderColor: p.accent, color: p.accent }}>{stats.byPhase[i]} group{stats.byPhase[i] === 1 ? '' : 's'}</span>
            </div>
            <p className="small mono muted" style={{ marginTop: -4 }}>{p.thai}</p>
            <p className="small">{p.goal}</p>
            <div className="divider" />
            <p className="small"><b>Mentor:</b> {p.mentor}</p>
            <p className="small"><b>ACAD:</b> {p.acad}</p>
          </div>
        ))}
      </div>

      <div className="card lg">
        <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />GROUPS · {state.groups.length}</div>
        <div className="tbl-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr><th>Group</th><th>Topic</th><th>น้อง</th><th>Mentor / ACAD</th><th>Phase</th><th>Outcome</th><th></th></tr>
            </thead>
            <tbody>
              {state.groups.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name}</b></td>
                  <td className="small">{g.topic || <span className="muted">— topic TBD —</span>}</td>
                  <td className="mono">{g.members.length}</td>
                  <td className="small">{g.mentor || '—'}<div className="mono muted" style={{ fontSize: 11 }}>{g.acad || '—'}</div></td>
                  <td><PhaseTrack current={g.currentPhase} dropped={g.outcome === 'dropped'} /></td>
                  <td><OutcomeBadge outcome={g.outcome} /></td>
                  <td><button className="btn ghost sm" onClick={() => setSelected(g.id)}>Open →</button></td>
                </tr>
              ))}
              {state.groups.length === 0 && <tr><td colSpan={7} className="empty" style={{ padding: 18 }}>No groups yet — add the first one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function PhaseTrack({ current, dropped }: { current: number; dropped?: boolean }) {
  return (
    <span className="flex" style={{ gap: 4 }}>
      {[1, 2, 3].map((n) => (
        <span key={n} title={PHASES[n - 1].title} style={{ width: 22, height: 6, borderRadius: 3, background: dropped ? 'var(--border-subtle)' : n <= current ? PHASES[current - 1].accent : 'var(--border-subtle)', opacity: dropped ? 0.6 : 1 }} />
      ))}
      <span className="mono muted" style={{ fontSize: 11, marginLeft: 4 }}>{dropped ? '—' : `P${current}`}</span>
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: GroupOutcome }) {
  const m = OUTCOME_META[outcome]
  return <span className="pill" style={{ borderColor: m.color, color: m.color }} title={m.hint}>{m.label}</span>
}

// ---------- group detail ----------
function GroupDetail({ group, ll, onBack }: { group: LitGroup; ll: ReturnType<typeof useLitLink>; onBack: () => void }) {
  const [newMember, setNewMember] = useState('')
  const g = group
  const set = (patch: Partial<LitGroup>) => ll.patchGroup(g.id, patch)

  const { createProject, switchProject } = useStore()
  const nav = useSwapNavigate()
  const [ai, setAi] = useState<{ kind: 'reading' | 'critique'; text: string; on: boolean } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function runAi(kind: 'reading' | 'critique', messages: ChatMessage[]) {
    if (ai?.on) return
    if (!hasKey()) { setAi({ kind, text: '_Terra is off — add an OpenAI key in Knowledge review → Settings._', on: false }); return }
    setAi({ kind, text: '', on: true })
    const ctrl = new AbortController(); abortRef.current = ctrl
    try { await streamChat({ messages, model: getModel(), signal: ctrl.signal, onToken: (d) => setAi((a) => (a ? { ...a, text: a.text + d } : a)) }) }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setAi((a) => (a ? { ...a, text: a.text + `\n\n_⚠ ${e instanceof Error ? e.message : 'failed'}_` } : a)) }
    finally { setAi((a) => (a ? { ...a, on: false } : a)); abortRef.current = null }
  }
  function suggestReading() {
    runAi('reading', [
      { role: 'system', content: 'You are a research mentor helping a student group build FOUNDATIONAL knowledge before a focused literature review. Suggest a concise, focused reading plan: the core concepts to master first and the kinds of landmark reviews / textbook chapters to read (name well-known sources and topics — do NOT fabricate specific citations or DOIs). Return short markdown with grouped bullets. End with one "good first question to sharpen" prompt.' },
      { role: 'user', content: `Foundational area: ${g.foundationArea || '(not set)'}\nSpecific topic they intend to review: ${g.topic || '(not set)'}` },
    ])
  }
  function critiqueRQ() {
    const rq = g.researchQuestion?.trim()
    if (!rq) { setAi({ kind: 'critique', text: '_Write a draft research question first (choose the Research Question outcome below)._', on: false }); return }
    runAi('critique', [
      { role: 'system', content: 'You are a research mentor judging whether a draft is a strong RESEARCH QUESTION — one current knowledge cannot yet answer, that is specific, novel, feasible and answerable (FINER). Return concise markdown: (1) a one-line verdict, (2) 2–3 specific strengths/weaknesses (novelty, answerability, scope, PICO clarity), (3) a sharpened rewrite.' },
      { role: 'user', content: `Topic: ${g.topic || '(not set)'}\nDraft research question: ${rq}` },
    ])
  }
  function promote() {
    if (g.promotedProjectId) { switchProject(g.promotedProjectId); nav('/protocol'); return }
    const rq = g.researchQuestion?.trim()
    if (!rq) return
    const code = `LL-${g.name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 8).toUpperCase() || 'GRP'}`
    const id = createProject(g.topic || g.name, code, { question: rq })
    ll.patchGroup(g.id, { promotedProjectId: id })
    // defer the route change so the LitLink store commits the promoted link
    // before this page unmounts (otherwise React drops the pending update)
    setTimeout(() => nav('/protocol'), 0)
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={onBack}>← All groups</button>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Kicker>program / litlink / group</Kicker>
            <input className="input" style={{ fontSize: 24, fontWeight: 800, marginTop: 8, width: '100%', maxWidth: 560 }} value={g.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="row-actions" style={{ flex: 'none', alignItems: 'center', gap: 8 }}>
            <OutcomeBadge outcome={g.outcome} />
            <button className="btn ghost sm danger" onClick={() => { if (confirm(`Remove ${g.name}?`)) { ll.removeGroup(g.id); onBack() } }}>Delete</button>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />TOPIC &amp; SCOPE</div>
          <label className="fld"><span className="fld-l">Foundational area</span><input className="input" value={g.foundationArea ?? ''} onChange={(e) => set({ foundationArea: e.target.value })} placeholder="the broader domain to ground in first" /></label>
          <label className="fld"><span className="fld-l">Specific topic</span><input className="input" value={g.topic ?? ''} onChange={(e) => set({ topic: e.target.value })} placeholder="the focused review topic" /></label>
          <div className="grid g2">
            <label className="fld"><span className="fld-l">Mentor</span><input className="input" value={g.mentor ?? ''} onChange={(e) => set({ mentor: e.target.value })} placeholder="advice · feedback · lit-review support" /></label>
            <label className="fld"><span className="fld-l">ACAD</span><input className="input" value={g.acad ?? ''} onChange={(e) => set({ acad: e.target.value })} placeholder="liaison · scheduling" /></label>
          </div>
          <button className="btn ghost sm" onClick={suggestReading} disabled={ai?.on} title="AI suggests core concepts & landmark reviews to build the foundation first">terra · suggest foundational reading</button>
        </div>
        <div className="card lg">
          <div className="card-h" style={{ justifyContent: 'space-between' }}><span><span className="sq" style={{ background: 'var(--violet)' }} />น้อง · {g.members.length}</span></div>
          {g.members.map((m) => (
            <div className="flex" key={m.id} style={{ gap: 8, marginBottom: 6 }}>
              <input className="input" style={{ flex: 1 }} value={m.name} onChange={(e) => ll.patchMember(g.id, m.id, { name: e.target.value })} />
              <input className="input" style={{ width: 90 }} value={m.role ?? ''} placeholder="year" onChange={(e) => ll.patchMember(g.id, m.id, { role: e.target.value })} />
              <button className="icon-btn danger" onClick={() => ll.removeMember(g.id, m.id)}>✕</button>
            </div>
          ))}
          <div className="flex" style={{ gap: 8, marginTop: 8 }}>
            <input className="input" style={{ flex: 1 }} value={newMember} placeholder="add น้อง…" onChange={(e) => setNewMember(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newMember.trim()) { ll.addMember(g.id, newMember.trim()); setNewMember('') } }} />
            <button className="btn ghost sm" disabled={!newMember.trim()} onClick={() => { ll.addMember(g.id, newMember.trim()); setNewMember('') }}>＋ Add</button>
          </div>
          {g.members.length > 4 && <p className="small" style={{ color: 'var(--amber)', marginTop: 6 }}>Groups are meant to be 3–4 น้อง.</p>}
        </div>
      </div>

      {ai && (
        <div className="card lg rail" style={{ marginBottom: 16 }}>
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <span><span className="sq" style={{ background: 'var(--research)' }} />{ai.kind === 'reading' ? 'terra · foundational reading plan' : 'terra · research-question critique'}{ai.on ? ' · streaming…' : ''}</span>
            <span className="flex" style={{ gap: 8 }}>
              {ai.on ? <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="btn ghost sm" onClick={() => setAi(null)}>Dismiss</button>}
            </span>
          </div>
          {ai.on && !ai.text ? <Sk kind={ai.kind === 'reading' ? 'reading' : 'finer'} /> : <Markdown text={ai.text} />}
        </div>
      )}

      {/* phases */}
      {PHASES.map((p, i) => {
        const prog = g.phases[i]
        const isCurrent = g.currentPhase === i + 1 && g.outcome !== 'dropped'
        return (
          <div className="card lg" key={p.key} style={{ marginBottom: 16, borderLeft: `4px solid ${p.accent}`, opacity: g.outcome === 'dropped' ? 0.7 : 1 }}>
            <div className="card-h" style={{ justifyContent: 'space-between' }}>
              <span><span className="sq" style={{ background: p.accent }} />PHASE {p.n} · {p.title.toUpperCase()} <span className="mono muted" style={{ fontWeight: 400 }}>· {p.thai}</span></span>
              <span className="flex" style={{ gap: 8, alignItems: 'center' }}>
                {isCurrent && <span className="pill" style={{ borderColor: p.accent, color: p.accent }}>current</span>}
                <span className="seg">
                  {(['not-started', 'active', 'done'] as PhaseStatus[]).map((st) => (
                    <button key={st} className={`seg-b${prog.status === st ? ' on' : ''}`} onClick={() => ll.patchPhase(g.id, i, { status: st })}>{STATUS_LABEL[st]}</button>
                  ))}
                </span>
              </span>
            </div>
            <div className="grid g2">
              <div>
                <p className="small">{p.goal}</p>
                <p className="small"><b>Expected deliverable:</b> {p.deliverable}</p>
                <div className="divider" />
                <p className="small"><b>Mentor:</b> {p.mentor}</p>
                <p className="small"><b>ACAD:</b> {p.acad}</p>
              </div>
              <div>
                <label className="fld"><span className="fld-l">Group's deliverable / output</span><input className="input" value={prog.deliverable ?? ''} onChange={(e) => ll.patchPhase(g.id, i, { deliverable: e.target.value })} placeholder="what the group produced" /></label>
                <label className="fld"><span className="fld-l">Working notes / lit log</span><textarea className="textarea" rows={2} value={prog.notes ?? ''} onChange={(e) => ll.patchPhase(g.id, i, { notes: e.target.value })} /></label>
                <label className="fld"><span className="fld-l" style={{ color: p.accent }}>Mentor feedback</span><textarea className="textarea" rows={2} value={prog.mentorFeedback ?? ''} onChange={(e) => ll.patchPhase(g.id, i, { mentorFeedback: e.target.value })} /></label>
              </div>
            </div>
            {isCurrent && i < 2 && <button className="btn primary sm" style={{ marginTop: 10 }} onClick={() => ll.advance(g.id)}>Mark done &amp; advance to Phase {p.n + 1} →</button>}
          </div>
        )
      })}

      {/* outcome */}
      <div className="card lg rail" style={{ ['--rail' as string]: 'var(--green)' } as CSSProperties}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--green)' }} />OUTCOME · the endpoint is flexible</div>
        <div className="seg" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {(Object.keys(OUTCOME_META) as GroupOutcome[]).map((o) => (
            <button key={o} className={`seg-b${g.outcome === o ? ' on' : ''}`} onClick={() => set({ outcome: o })}>{OUTCOME_META[o].label}</button>
          ))}
        </div>
        {g.outcome === 'research-question' && (
          <>
            <label className="fld"><span className="fld-l">Research Question <span className="muted">— a question current knowledge can't yet answer</span></span><textarea className="textarea" rows={3} value={g.researchQuestion ?? ''} onChange={(e) => set({ researchQuestion: e.target.value })} placeholder="State the group's research question." /></label>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn ghost sm" onClick={critiqueRQ} disabled={ai?.on || !g.researchQuestion?.trim()}>terra · critique this question</button>
              {g.promotedProjectId
                ? <button className="btn primary sm" onClick={promote}>Open the review project →</button>
                : <button className="btn primary sm" onClick={promote} disabled={!g.researchQuestion?.trim()} title="Create a systematic-review project seeded with this question">🚀 Promote to a review project →</button>}
              {g.promotedProjectId && <span className="pill" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>promoted ✓</span>}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Promoting creates a new systematic-review project seeded with this question — the group's work flows straight into the SRMA workbench (Protocol → Screening → Meta-analysis).</p>
          </>
        )}
        {g.outcome === 'reflection' && (
          <label className="fld"><span className="fld-l">Reflection <span className="muted">— process, what you enjoyed, advice you'd want</span></span><textarea className="textarea" rows={4} value={g.reflection ?? ''} onChange={(e) => set({ reflection: e.target.value })} placeholder="Reflect on the research process, your interest in the topic, and the guidance you'd want for future research." /></label>
        )}
        {g.outcome === 'dropped' && (
          <label className="fld"><span className="fld-l">Note <span className="muted">— stepping out is supported, no penalty</span></span><textarea className="textarea" rows={2} value={g.dropReason ?? ''} onChange={(e) => set({ dropReason: e.target.value })} placeholder="Optional: what got in the way, so the mentor can help." /></label>
        )}
        {g.outcome === 'in-progress' && <p className="small muted">Choose an endpoint when the group is ready — a Research Question, a Reflection, or a supported step-out. None is a failure.</p>}
      </div>
    </>
  )
}
