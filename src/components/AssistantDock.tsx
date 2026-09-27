import { useEffect, useRef, useState } from 'react'
import { Sk } from './Skeleton'
import { useLocation } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Markdown } from './Markdown'
import { Portal } from './Portal'
import { streamChat, chatWithTools, hasKey, getModel, type ChatMessage, type ToolDef } from '../lib/openai'
import { retrieve, groundingBlock } from '../lib/theoryRag'
import { searchPubmed } from '../lib/pubmed'
import { STAGES } from '../types'
import { analysisIncluded } from '../lib/cohorts'

type Msg = { role: 'user' | 'assistant'; content: string; sources?: string[] }

const PAGE: Record<string, string> = {
  '/': 'Overview',
  '/pit-wall': 'Dashboard',
  '/hypotheses': 'Hypotheses',
  '/mechanism': 'Mechanism Map',
  '/assays': 'Assays',
  '/radar': 'Literature',
  '/power': 'Statistical Power',
  '/suspension': 'Rigor Monitor',
  '/graph': 'Knowledge Graph',
  '/theory': 'Theory',
  '/review': 'Knowledge Review',
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

const TOOLS: ToolDef[] = [
  fn('add_study', 'Add a study to the systematic review. Provide 2×2 counts for a binary outcome when known (exposed/index vs control).', {
    author: { type: 'string', description: 'First author surname' },
    year: { type: 'number' },
    expEvents: { type: 'number', description: 'events in the index/exposed group' },
    expTotal: { type: 'number', description: 'total in the index/exposed group' },
    ctrlEvents: { type: 'number', description: 'events in the comparator group' },
    ctrlTotal: { type: 'number', description: 'total in the comparator group' },
    note: { type: 'string' },
  }, ['author', 'year']),
  fn('add_hypothesis', 'Add a working hypothesis to the project board.', {
    label: { type: 'string', description: 'short name' },
    statement: { type: 'string', description: 'the full falsifiable statement' },
  }, ['label', 'statement']),
  fn('set_stage', 'Set the project lifecycle stage.', {
    stage: { type: 'string', enum: STAGES as unknown as string[] },
  }, ['stage']),
  fn('import_studies_to_graph', 'Materialise the included review studies as linked nodes on the knowledge graph.', {}),
  fn('search_pubmed', 'Search PubMed and return the top matching papers.', {
    query: { type: 'string' },
  }, ['query']),
]

export default function AssistantDock() {
  const { state, addStudy, addHypothesis, setStage, importStudiesToGraph } = useStore()
  const loc = useLocation()
  const page = PAGE[loc.pathname] ?? 'WilliamsLab'

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tools, setTools] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, open])

  // opened from the command palette's "Ask the AI copilot" action
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('wl-open-copilot', onOpen)
    return () => window.removeEventListener('wl-open-copilot', onOpen)
  }, [])

  function system(): ChatMessage {
    const hyps = state.hypotheses.map((h) => `- ${h.label}`).join('\n')
    return {
      role: 'system',
      content: `You are the WilliamsLab research copilot. Stay within the active project's topic and context. The user is currently on the "${page}" page.

Project: "${state.project.name}" (stage: ${state.project.stage ?? 'n/a'}).
Domain: ${state.project.domain}
Review question: ${state.review.question || 'Not defined'}
Central hypothesis: "${state.project.centralHypothesis}"
Working hypotheses:
${hyps}
Review: ${state.review.studies.filter(analysisIncluded).length} included studies.

You can act on the project with tools: add_study, add_hypothesis, set_stage, import_studies_to_graph, search_pubmed. When the user asks you to do one of these, call the tool and then confirm briefly what you did. Do not fabricate study numbers — only add a study with counts the user gave you.

Be concise and practical. Use markdown (## headings, **bold**, - bullets). Help with the project's subject, theory, study design, statistics, and using this app. Do not assume the project is about a particular disease. This is for research and education, not clinical care.`,
    }
  }

  const num = (x: unknown) => (x === undefined || x === null || x === '' ? undefined : Number(x))
  async function execute(name: string, a: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'add_study':
        addStudy({
          author: String(a.author ?? 'Unknown'),
          year: Number(a.year) || new Date().getFullYear(),
          include: true,
          expEvents: num(a.expEvents),
          expTotal: num(a.expTotal),
          ctrlEvents: num(a.ctrlEvents),
          ctrlTotal: num(a.ctrlTotal),
          note: a.note ? String(a.note) : undefined,
        })
        return `Added study “${a.author} ${a.year}” to the review.`
      case 'add_hypothesis':
        addHypothesis({ label: String(a.label ?? 'Untitled'), statement: String(a.statement ?? ''), status: 'draft' })
        return `Added hypothesis “${a.label}”.`
      case 'set_stage':
        setStage(String(a.stage))
        return `Project stage set to ${a.stage}.`
      case 'import_studies_to_graph': {
        const n = importStudiesToGraph()
        return `Imported ${n} study node${n === 1 ? '' : 's'} onto the knowledge graph.`
      }
      case 'search_pubmed': {
        const hits = await searchPubmed(String(a.query ?? ''), 5)
        return hits.length ? hits.map((h) => `- ${h.title} — ${h.journal ?? ''} ${h.year ?? ''} (PMID ${h.pmid})`).join('\n') : 'No PubMed results.'
      }
      default:
        return `Unknown tool ${name}.`
    }
  }

  async function send(text: string) {
    const q = text.trim()
    if (!q || streaming) return
    if (!hasKey()) {
      setMessages((m) => [...m, { role: 'assistant', content: '_No OpenAI key set. Add one in **Knowledge Review → Settings** (stored only in your browser)._' }])
      return
    }
    setInput('')
    const hits = retrieve(q, state, 2)
    const sources = hits.map((h) => h.title)
    const grounding = groundingBlock(hits, state)
    const history = messages
    const callMsgs: ChatMessage[] = [
      system(),
      ...(grounding ? [{ role: 'system', content: grounding } as ChatMessage] : []),
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: q },
    ]
    setMessages([...history, { role: 'user', content: q }, { role: 'assistant', content: '', sources }])
    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      if (tools) {
        const { text: out, actions } = await chatWithTools({ messages: callMsgs, model: getModel(), tools: TOOLS, execute: (name, args) => { ctrl.signal.throwIfAborted(); return execute(name, args) }, signal: ctrl.signal })
        const actionsMd = actions.length ? '\n\n' + actions.map((x) => `\`✓ ${x.name}\` — ${x.result.split('\n')[0]}`).join('\n') : ''
        setMessages((prev) => {
          const copy = prev.slice()
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: (out || '_(done)_') + actionsMd }
          return copy
        })
      } else {
        await streamChat({
          messages: callMsgs,
          model: getModel(),
          signal: ctrl.signal,
          onToken: (d) =>
            setMessages((prev) => {
              const copy = prev.slice()
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + d }
              return copy
            }),
        })
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setMessages((prev) => {
          const copy = prev.slice()
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content || `_⚠ ${msg}_` }
          return copy
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const suggestions = [
    `Summarize the ${page} page`,
    `Search PubMed for ${state.review.question || state.project.name}`,
    'Explain the theory behind my central hypothesis',
    'Import my review studies onto the graph',
  ]

  if (!open) {
    return (
      <Portal>
        <button className="ai-fab" onClick={() => setOpen(true)} aria-label="Open AI copilot">
          <span className="spark">✦</span> Ask AI
          <span className="rdot" />
        </button>
      </Portal>
    )
  }

  return (
    <Portal>
      <div className="ai-panel" role="dialog" aria-label="AI copilot">
        <div className="ai-head">
          <div className="avatar">✦</div>
          <div className="t">Research copilot<small>{page} · {getModel()}</small></div>
          <span className="sp" />
          <button className={`tool-toggle${tools ? ' on' : ''}`} onClick={() => setTools((v) => !v)} title="Let the copilot act on your project (add study, set stage, search PubMed…)">⚙ Tools {tools ? 'on' : 'off'}</button>
          {messages.length > 0 && <button className="ai-x" onClick={() => setMessages([])} title="Clear" style={{ marginRight: 6 }}>⟲</button>}
          <button className="ai-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>

        <div className="ai-thread">
          {messages.length === 0 ? (
            <div className="ai-empty">
              <b>Ask anything</b> about {state.project.code}, its theory, hypotheses, statistics, or this page — or ask me to <b>do</b> something (add a study, set the stage, search PubMed).
              <div className="ai-sugg">
                {suggestions.map((s) => (
                  <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>
                {m.role === 'assistant' ? (m.content ? <Markdown text={m.content} /> : <Sk kind="answer" label="Thinking" />) : m.content}
                {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                  <div className="msg-meta">{m.sources.map((s) => <span key={s} className="src-chip">§ {s}</span>)}</div>
                )}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="ai-foot">
          <textarea
            className="textarea"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={tools ? 'Ask or instruct the copilot…' : 'Ask the copilot…'}
          />
          {streaming ? (
            <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Stop</button>
          ) : (
            <button className="btn primary sm" onClick={() => send(input)} disabled={!input.trim()}>Send</button>
          )}
        </div>
        <div className="ai-note">{tools ? 'Tools on · the copilot can edit your project' : 'Educational · verify against primary sources'}</div>
      </div>
    </Portal>
  )
}
