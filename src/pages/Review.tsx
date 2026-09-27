import { useEffect, useRef, useState } from 'react'
import { Sk } from '../components/Skeleton'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { Markdown } from '../components/Markdown'
import { streamChat, hasKey, getKey, setKey, getModel, setModel, keySource, estimateCost, fmtCost, MODELS, type ChatMessage } from '../lib/openai'
import { systemPrompt, reviewPresets } from '../lib/brsReview'
import { retrieve, groundingBlock } from '../lib/theoryRag'
import { listSessions, saveSession, removeSession, sessionTitle, transcriptMarkdown, onePagerHtml, download, type ReviewMsg, type SavedSession } from '../lib/reviewSessions'

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`)

export default function Review() {
  const { state } = useStore()
  return <ProjectReview key={state.project.id} />
}

function ProjectReview() {
  const { state } = useStore()
  const [params] = useSearchParams()
  const presets = reviewPresets(state)
  const [messages, setMessages] = useState<ReviewMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState(() => params.get('settings') === '1')
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [savedNote, setSavedNote] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [model, setModelState] = useState(getModel())
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const totalTokens = messages.reduce((n, m) => n + (m.usage?.total_tokens ?? 0), 0)
  const totalCost = messages.reduce((c, m) => c + (m.usage ? estimateCost(model, m.usage) : 0), 0)

  async function send(text: string) {
    const q = text.trim()
    if (!q || streaming) return
    if (!hasKey()) {
      setKeyDraft('')
      setSettings(true)
      return
    }
    setError(null)
    setSavedNote('')
    setInput('')
    // Retrieve only the active project's theory.
    const hits = retrieve(q, state, 3)
    const sources = hits.map((h) => h.title)
    const grounding = groundingBlock(hits, state)
    const history = messages
    const callMsgs: ChatMessage[] = [
      systemPrompt(state),
      ...(grounding ? [{ role: 'system', content: grounding } as ChatMessage] : []),
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: q },
    ]
    setMessages([...history, { role: 'user', content: q }, { role: 'assistant', content: '', sources }])
    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamChat({
        messages: callMsgs,
        model,
        signal: ctrl.signal,
        onToken: (delta) =>
          setMessages((prev) => {
            const copy = prev.slice()
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, content: last.content + delta }
            return copy
          }),
        onUsage: (u) =>
          setMessages((prev) => {
            const copy = prev.slice()
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, usage: u }
            return copy
          }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(msg)
        setMessages((prev) => {
          const copy = prev.slice()
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content ? `${last.content}\n\n_⚠ ${msg}_` : `_⚠ ${msg}_` }
          return copy
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function saveSettings() {
    if (keyDraft.trim()) setKey(keyDraft.trim())
    setModel(model)
    setSettings(false)
  }

  function doSave() {
    if (!messages.length) return
    saveSession({ id: newId(), projectId: state.project.id, title: sessionTitle(messages), ts: Date.now(), model, messages })
    setSavedNote('Session saved.')
  }
  function openSessions() {
    setSessions(listSessions(state.project.id))
    setSessionsOpen(true)
  }
  function loadSession(s: SavedSession) {
    setMessages(s.messages)
    setSessionsOpen(false)
  }
  function deleteSession(id: string) {
    removeSession(id)
    setSessions(listSessions(state.project.id))
  }
  function exportMd() {
    download(`knowledge-review-${Date.now()}.md`, 'text/markdown', transcriptMarkdown(messages, { project: state.project.name, model, ts: Date.now() }))
  }
  function exportOnePager() {
    const html = onePagerHtml(messages, { project: state.project.name, question: state.review.question, model, ts: Date.now() })
    download(`knowledge-review-onepager-${Date.now()}.html`, 'text/html', html)
  }

  const src = keySource()

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>KNOWLEDGE REVIEW · {state.project.code}</Kicker>
            <h1 style={{ marginTop: 12 }}>Knowledge Review</h1>
            <p>Explore {state.project.name}. Answers use this project's Theory when available, cite the sections they draw from, and stream live.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="pill" title="Model in use"><b>{model}</b></span>
            <button className="icon-btn" onClick={openSessions}>❑ Sessions</button>
            {messages.length > 0 && <button className="icon-btn" onClick={doSave}>⤵ Save</button>}
            {messages.length > 0 && <button className="icon-btn" onClick={exportMd}>⤓ .md</button>}
            {messages.length > 0 && <button className="icon-btn" onClick={exportOnePager}>⤓ OnePager</button>}
            {messages.length > 0 && <button className="icon-btn" onClick={() => setMessages([])}>Clear</button>}
            <button className="icon-btn" onClick={() => { setKeyDraft(''); setSettings(true) }}>⚙ Settings</button>
          </div>
        </div>
        {savedNote && <p className="small" style={{ color: 'var(--accent)', marginTop: 6 }}>{savedNote}</p>}
      </div>

      {src === 'none' && (
        <div className="card lg note" style={{ marginBottom: 16 }}>
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />NO API KEY</div>
          <p className="small" style={{ marginBottom: 12 }}>Add your OpenAI API key to start. It is stored only in this browser (localStorage) and never leaves your machine except in calls to OpenAI.</p>
          <button className="btn primary sm" onClick={() => { setKeyDraft(''); setSettings(true) }}>Add API key</button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />START A REVIEW</div>
          <div className="grid g4" style={{ gap: 12 }}>
            {presets.map((p) => (
              <button key={p.id} className="preset" onClick={() => send(p.prompt)} disabled={streaming}>
                <b>{p.label}</b>
                <span>{p.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="thread">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? (
                <>
                  {m.content ? <Markdown text={m.content} /> : <Sk kind="answer" />}
                  {(m.sources?.length || m.usage) && (
                    <div className="msg-meta">
                      {m.sources?.map((s) => <span key={s} className="src-chip" title="From this project's Theory section">§ {s}</span>)}
                      {m.usage && <span className="tok-meta" title="Estimated — approximate list pricing">▲ {m.usage.total_tokens.toLocaleString()} tok · ~{fmtCost(estimateCost(model, m.usage))}</span>}
                    </div>
                  )}
                </>
              ) : (
                m.content
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* preset quick-bar + composer */}
      <div className="composer">
        {messages.length > 0 && (
          <div className="preset-bar">
            {presets.map((p) => (
              <button key={p.id} className="chip-btn" onClick={() => send(p.prompt)} disabled={streaming}>{p.label}</button>
            ))}
          </div>
        )}
        <div className="composer-row">
          <textarea
            className="textarea"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask about this project's theory, or pick a topic above… (Enter to send)"
          />
          {streaming ? (
            <button className="btn ghost" onClick={stop}>Stop</button>
          ) : (
            <button className="btn primary" onClick={() => send(input)} disabled={!input.trim()}>Send</button>
          )}
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          Educational review, not clinical advice — verify against primary sources. Model: {MODELS.find((m) => m.id === model)?.label ?? model}. Key: {src === 'env' ? 'from .env.local' : src === 'settings' ? 'from browser' : 'not set'}.
          {totalTokens > 0 && <> · This session: <b>{totalTokens.toLocaleString()} tokens</b> · est. <b>{fmtCost(totalCost)}</b>.</>}
        </p>
      </div>

      {sessionsOpen && (
        <Modal title="Saved review sessions" onClose={() => setSessionsOpen(false)}>
          {sessions.length === 0 ? (
            <p className="empty">No saved sessions yet. Run a review and hit <b>Save</b>.</p>
          ) : (
            <div className="session-list">
              {sessions.map((s) => (
                <div key={s.id} className="session-item">
                  <div className="session-meta">
                    <b>{s.title}</b>
                    <span className="small mono muted">{new Date(s.ts).toLocaleString()} · {s.messages.filter((m) => m.role === 'user').length} Q · {s.model}</span>
                  </div>
                  <button className="btn ghost sm" onClick={() => loadSession(s)}>Load</button>
                  <button className="icon-btn danger" onClick={() => deleteSession(s.id)} title="Delete">✕</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {settings && (
        <Modal title="OpenAI settings" onClose={() => setSettings(false)}>
          <Field label="API key" hint={src !== 'none' ? `A key is already set (${src === 'env' ? 'from .env.local' : 'from this browser'}). Enter a new one to override.` : 'Stored only in this browser (localStorage).'}>
            <input className="input" type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={getKey() ? '•••••••••• (set)' : 'sk-…'} autoComplete="off" />
          </Field>
          <Field label="Model">
            <select className="select" value={model} onChange={(e) => setModelState(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <div className="form-actions">
            {src === 'settings' && <button className="icon-btn danger" onClick={() => { setKey(''); setKeyDraft(''); }}>Clear stored key</button>}
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setSettings(false)}>Cancel</button>
            <button className="btn primary" onClick={saveSettings}>Save</button>
          </div>
        </Modal>
      )}

      {error && !streaming && <p className="small" style={{ color: 'var(--red)', marginTop: 8 }}>⚠ {error}</p>}
    </>
  )
}
