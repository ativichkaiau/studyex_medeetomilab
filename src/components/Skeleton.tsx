import type { CSSProperties, ReactNode } from 'react'

/**
 * Skeletons — every loading state shows a blueprint of what it is waiting
 * for, never a generic spinner. Route skeletons (the Suspense fallbacks while
 * a page's code arrives) trace that page's real layout: the forest plot and
 * funnel for Meta-analysis, the flow boxes for PRISMA, nodes and edges for the
 * graph. Async skeletons trace the result that is on its way: a critique's
 * three verdicts, an SOP's numbered steps, a 2×2 table filling in.
 *
 * In 3D (skeleton.css) a blueprint lies back on the drafting table with its
 * parts floating at different heights while a livery scan line passes over
 * it; in 2D it is a flat shimmer. Always role="status" with a spoken label,
 * and motionless under reduced motion.
 */

// ---------- primitives ----------

type Z = { z?: number }
// --z places a part at its height above the blueprint; --zn is the same number
// unitless, for timing it (dividing px by px needs typed calc, not yet universal)
const zs = (z = 0, extra?: CSSProperties) => ({ ['--z' as string]: `${z}px`, ['--zn' as string]: z, ...extra }) as CSSProperties

/** a shimmering bar; widths are % of the row unless given in px */
function Bar({ w = 100, h = 10, tone, style }: { w?: number | string; h?: number; tone?: 'ink' | 'accent' | 'soft'; style?: CSSProperties }) {
  return <i className={`sk-bar${tone ? ` ${tone}` : ''}`} style={{ width: typeof w === 'number' ? `${w}%` : w, height: h, ...style }} />
}

/** a paragraph of bars, the last line short */
function Para({ lines = 3, gap = 9, last = 62 }: { lines?: number; gap?: number; last?: number }) {
  return (
    <div className="sk-para" style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => <Bar key={i} w={i === lines - 1 ? last : 96 - ((i * 7) % 14)} h={9} />)}
    </div>
  )
}

function Block({ z = 0, className = '', style, children }: Z & { className?: string; style?: CSSProperties; children?: ReactNode }) {
  return <div className={`sk-block ${className}`} style={zs(z, style)}>{children}</div>
}

/** a card: livery tick + header bar, then whatever it holds */
function Card({ z = 14, title = 34, children, className = '' }: Z & { title?: number; children?: ReactNode; className?: string }) {
  return (
    <Block z={z} className={`sk-card ${className}`}>
      <div className="sk-card-h"><i className="sk-tick" /><Bar w={title} h={8} tone="soft" /></div>
      {children}
    </Block>
  )
}

const Row = ({ cols = '1fr 1fr', children }: { cols?: string; children: ReactNode }) => (
  <div className="sk-row" style={{ gridTemplateColumns: cols }}>{children}</div>
)

/** the page head every page shares: stripes, kicker, headline, standfirst */
function Head({ h1 = 46, lines = 1, deck = 58 }: { h1?: number; lines?: number; deck?: number }) {
  return (
    <Block z={34} className="sk-head">
      <div className="sk-stripes"><i /><i /><i /></div>
      <Bar w={22} h={7} tone="soft" />
      <div className="sk-h1">{Array.from({ length: lines }, (_, i) => <Bar key={i} w={i === lines - 1 ? h1 * 0.7 : h1} h={24} tone="ink" />)}</div>
      <Bar w={deck} h={9} />
    </Block>
  )
}

function Stats({ n = 4, z = 22 }: { n?: number } & Z) {
  return (
    <Block z={z} className="sk-stats" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-stat" key={i}><Bar w={38} h={22} tone="ink" /><Bar w={62} h={7} tone="soft" /><Bar w={44} h={7} /></div>
      ))}
    </Block>
  )
}

function Chips({ n = 4, w = 14 }: { n?: number; w?: number }) {
  return <div className="sk-chips">{Array.from({ length: n }, (_, i) => <i key={i} className={`sk-chip${i === 0 ? ' on' : ''}`} style={{ width: `${w + ((i * 5) % 7)}%` }} />)}</div>
}

function Table({ rows = 5, cols = 5, z = 12 }: { rows?: number; cols?: number } & Z) {
  const tpl = `1.4fr ${'1fr '.repeat(cols - 1)}`
  return (
    <Block z={z} className="sk-table">
      <div className="sk-tr head" style={{ gridTemplateColumns: tpl }}>{Array.from({ length: cols }, (_, i) => <Bar key={i} w={50 + ((i * 13) % 30)} h={7} tone="soft" />)}</div>
      {Array.from({ length: rows }, (_, r) => (
        <div className="sk-tr" key={r} style={{ gridTemplateColumns: tpl }}>
          {Array.from({ length: cols }, (_, c) => <Bar key={c} w={c === 0 ? 70 + ((r * 11) % 25) : 35 + (((r + 2) * (c + 3) * 7) % 45)} h={9} tone={c === 0 ? 'ink' : undefined} />)}
        </div>
      ))}
    </Block>
  )
}

function Fields({ n = 4 }: { n?: number }) {
  return <div className="sk-fields">{Array.from({ length: n }, (_, i) => <div key={i}><Bar w={24} h={7} tone="soft" /><i className="sk-well" /></div>)}</div>
}

function Checklist({ n = 5, mark = '✓' }: { n?: number; mark?: string }) {
  return (
    <div className="sk-list">
      {Array.from({ length: n }, (_, i) => <div key={i}><b>{mark}</b><Bar w={58 + ((i * 17) % 36)} h={9} /></div>)}
    </div>
  )
}

// ---------- figures (inline SVG wireframes that draw themselves) ----------

/** `size` is the drawing's own coordinate space, "width/height" */
function Figure({ z = 20, children, size = '720/300' }: Z & { children: ReactNode; size?: string }) {
  const [w, h] = size.split('/')
  return (
    <Block z={z} className="sk-figure">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">{children}</svg>
    </Block>
  )
}

function Forest({ rows = 7 }: { rows?: number }) {
  const w = 720, x0 = 200, x1 = 520, top = 24, rh = 28
  return (
    <Figure size={`${w}/${top + rows * rh + 70}`}>
      <line className="sk-dash" x1={360} y1={top} x2={360} y2={top + rows * rh + 10} />
      {Array.from({ length: rows }, (_, i) => {
        const y = top + i * rh + rh / 2
        const c = 360 + (((i * 37) % 90) - 30)
        const hw = 30 + ((i * 23) % 60)
        return (
          <g key={i} className="sk-fp-row" style={{ ['--i' as string]: i } as CSSProperties}>
            <rect className="sk-fill" x={8} y={y - 5} width={110 + ((i * 29) % 60)} height={10} rx={3} />
            <line className="sk-draw" pathLength={1} x1={Math.max(x0, c - hw)} y1={y} x2={Math.min(x1, c + hw)} y2={y} />
            <rect className="sk-solid" x={c - 5} y={y - 5} width={10} height={10} />
            <rect className="sk-fill" x={x1 + 14} y={y - 5} width={120} height={10} rx={3} />
          </g>
        )
      })}
      <polygon className="sk-diamond" points={`${330},${top + rows * rh + 30} ${372},${top + rows * rh + 20} ${414},${top + rows * rh + 30} ${372},${top + rows * rh + 40}`} />
    </Figure>
  )
}

function Funnel() {
  return (
    <Figure size="420/300">
      <polygon className="sk-draw" pathLength={1} points="210,30 60,270 360,270" fill="none" />
      <line className="sk-dash" x1={210} y1={30} x2={210} y2={270} />
      {[[180, 90], [230, 120], [170, 160], [250, 175], [150, 210], [270, 215], [205, 235], [120, 250]].map(([x, y], i) => (
        <circle key={i} className="sk-solid sk-dot" cx={x} cy={y} r={6} style={{ ['--i' as string]: i } as CSSProperties} />
      ))}
    </Figure>
  )
}

function PrismaFlow() {
  const box = (x: number, y: number, w: number, h: number, i: number) => <rect key={`${x}-${y}`} className="sk-box" x={x} y={y} width={w} height={h} rx={8} style={{ ['--i' as string]: i } as CSSProperties} />
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line key={`${x1}${y1}${x2}${y2}`} className="sk-draw" pathLength={1} x1={x1} y1={y1} x2={x2} y2={y2} />
  return (
    <Figure size="720/420">
      {box(40, 20, 300, 66, 0)}{arrow(190, 86, 190, 118)}{box(40, 118, 300, 50, 1)}{box(400, 24, 300, 50, 2)}
      {arrow(340, 143, 400, 143)}{box(400, 118, 300, 50, 3)}{arrow(190, 168, 190, 200)}{box(40, 200, 300, 50, 4)}
      {arrow(340, 225, 400, 225)}{box(400, 200, 300, 84, 5)}{arrow(190, 250, 190, 300)}
      <rect className="sk-box accent" x={40} y={300} width={300} height={50} rx={8} style={{ ['--i' as string]: 6 } as CSSProperties} />
    </Figure>
  )
}

function Network({ layered = false }: { layered?: boolean }) {
  // deterministic scatter, or three layers for the mechanism DAG
  const pts = layered
    ? [[140, 60], [300, 60], [460, 60], [620, 60], [220, 170], [380, 170], [540, 170], [300, 280], [460, 280], [380, 380]]
    : [[120, 90], [260, 60], [420, 110], [580, 70], [180, 220], [340, 200], [500, 240], [640, 200], [260, 330], [440, 350], [580, 330], [100, 330]]
  const edges = layered
    ? [[0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [4, 7], [5, 7], [5, 8], [6, 8], [7, 9], [8, 9]]
    : [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 2], [5, 6], [6, 7], [3, 7], [4, 8], [8, 9], [9, 6], [9, 10], [10, 7], [11, 8], [11, 4]]
  return (
    <Figure size={layered ? '760/440' : '760/420'}>
      {edges.map(([a, b], i) => <line key={i} className="sk-draw" pathLength={1} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} />)}
      {pts.map(([x, y], i) => <circle key={i} className="sk-node" cx={x} cy={y} r={layered ? 20 : 16 + (i % 3) * 4} style={{ ['--i' as string]: i } as CSSProperties} />)}
    </Figure>
  )
}

function Curve({ roc = false }: { roc?: boolean }) {
  return (
    <Figure size="600/320">
      <line className="sk-draw" pathLength={1} x1={50} y1={280} x2={570} y2={280} /><line className="sk-draw" pathLength={1} x1={50} y1={280} x2={50} y2={20} />
      {roc && <line className="sk-dash" x1={50} y1={280} x2={570} y2={20} />}
      <path className="sk-draw strong" pathLength={1} d={roc ? 'M50,280 C90,90 220,40 570,26' : 'M50,272 C200,268 250,90 330,60 S480,32 570,30'} fill="none" />
      {roc && [[120, 110], [180, 80], [240, 64], [320, 52], [420, 40]].map(([x, y], i) => <circle key={i} className="sk-solid sk-dot" cx={x} cy={y} r={6} style={{ ['--i' as string]: i } as CSSProperties} />)}
    </Figure>
  )
}

function Gantt({ bars = 5 }: { bars?: number }) {
  return (
    <Figure size="720/220">
      {Array.from({ length: bars }, (_, i) => (
        <g key={i} className="sk-fp-row" style={{ ['--i' as string]: i } as CSSProperties}>
          <rect className="sk-fill" x={10} y={18 + i * 38} width={120} height={12} rx={3} />
          <rect className="sk-bar-svg" x={160 + ((i * 70) % 260)} y={14 + i * 38} width={130 + ((i * 53) % 150)} height={20} rx={5} />
        </g>
      ))}
    </Figure>
  )
}

// ---------- composite page parts ----------

function Pipeline() {
  return (
    <Block z={18} className="sk-pipeline">
      {['Foundations', 'Focused review', 'Synthesis'].map((p, i) => (
        <div key={p} className="sk-phase"><b>{i + 1}</b><Bar w={70} h={10} tone="ink" /><Bar w={90} h={7} /><Bar w={60} h={7} /></div>
      ))}
    </Block>
  )
}

function Records({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Block z={12 + i * 2} key={i} className="sk-record">
          <div><Bar w={88} h={12} tone="ink" /><Bar w={46} h={7} tone="soft" /><Para lines={2} /></div>
          <div className="sk-decide"><i /><i /><i /></div>
        </Block>
      ))}
    </>
  )
}

function Hits({ n = 4, verdicts = false }: { n?: number; verdicts?: boolean }) {
  return (
    <div className="sk-hits">
      {Array.from({ length: n }, (_, i) => (
        <Block z={10 + i * 3} key={i} className="sk-hit">
          {verdicts && <i className={`sk-verdict v${i % 3}`} />}
          <div className="sk-hit-body"><Bar w={92 - ((i * 9) % 20)} h={11} tone="ink" /><Bar w={64} h={7} tone="soft" /><Bar w={40} h={7} /></div>
        </Block>
      ))}
    </div>
  )
}

function Chat({ bubbles = 3 }: { bubbles?: number }) {
  return (
    <div className="sk-chat">
      {Array.from({ length: bubbles }, (_, i) => (
        <Block z={10 + i * 4} key={i} className={`sk-bubble ${i % 2 ? 'ai' : 'me'}`}>
          {i % 2 ? <Para lines={4} /> : <Bar w={80} h={10} tone="accent" />}
        </Block>
      ))}
      <Block z={26} className="sk-composer"><i className="sk-well" /><i className="sk-key" /></Block>
    </div>
  )
}

function Doc({ sections = 3, figure = false }: { sections?: number; figure?: boolean }) {
  return (
    <Block z={16} className="sk-doc">
      <Bar w={62} h={20} tone="ink" />
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="sk-doc-sec"><Bar w={30} h={12} tone="accent" /><Para lines={4 + (i % 2)} />{figure && i === 1 && <i className="sk-plate" />}</div>
      ))}
    </Block>
  )
}

// ---------- route blueprints ----------

const BLUEPRINTS: Record<string, () => ReactNode> = {
  '/': () => <><Head lines={2} /><Stats /><Card title={30}><Chips n={4} /></Card><Row cols="1.2fr 1fr"><Card><Para lines={6} /></Card><Card><Checklist n={2} mark="●" /><i className="sk-key wide" /></Card></Row></>,
  '/portfolio': () => <><Head /><Table rows={3} cols={5} /><Card title={24}><Fields n={3} /></Card></>,
  '/pit-wall': () => <><Head /><Block z={20} className="sk-tabs">{[0, 1, 2].map((i) => <div key={i} className={`sk-tab${i === 0 ? ' on' : ''}`}><Bar w={40} h={9} tone="ink" /><Para lines={2} /></div>)}</Block><Row><Card><Checklist n={6} mark="▬" /></Card><Card><Checklist n={6} mark="▬" /></Card></Row></>,
  '/litlink': () => <><Head /><Stats /><Pipeline /><Table rows={4} cols={5} /></>,
  '/radar': () => <><Head /><Block z={24} className="sk-search"><i className="sk-well" /><i className="sk-key" /></Block><Hits n={4} /></>,
  '/protocol': () => <><Head /><Card><Para lines={3} /></Card><Block z={20} className="sk-peco">{['P', 'E', 'C', 'O'].map((k) => <div key={k}><b>{k}</b><Para lines={4} /></div>)}</Block><Row><Card><Checklist n={5} /></Card><Card><Checklist n={5} mark="✕" /></Card></Row><Card><i className="sk-code" /><i className="sk-code" /></Card></>,
  '/screening': () => <><Head /><Stats /><Records n={3} /></>,
  '/prisma': () => <><Head /><Row cols="1.5fr 1fr"><Card><PrismaFlow /></Card><Card><Fields n={6} /></Card></Row></>,
  '/studies': () => <><Head /><Card title={40}><Chips n={5} w={10} /></Card><Table rows={6} cols={8} /></>,
  '/meta': () => <><Head /><Stats /><Card title={30}><Forest /></Card><Row><Card><Checklist n={4} mark="·" /></Card><Card><Funnel /></Card></Row></>,
  '/diagnostic': () => <><Head /><Row><Card><Curve roc /></Card><Card><Forest rows={5} /></Card></Row></>,
  '/references': () => <><Head /><Stats /><Table rows={6} cols={4} /></>,
  '/manuscript': () => <><Head /><Doc sections={4} figure /></>,
  '/poster': () => <><Head /><Block z={20} className="sk-poster"><Bar w={70} h={22} tone="ink" /><div className="sk-poster-cols">{[0, 1, 2].map((i) => <div key={i}><Bar w={50} h={10} tone="accent" /><Para lines={5} /><i className="sk-plate" /></div>)}</div></Block><Block z={10} className="sk-slides">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</Block></>,
  '/reviewers': () => <><Head /><Row cols="1fr 1.2fr"><Card><i className="sk-well tall" /></Card><Doc sections={3} /></Row></>,
  '/hypotheses': () => <><Head /><Block z={24} className="sk-hyps">{[0, 1, 2].map((i) => <div key={i} className="sk-hyp"><div className="sk-hyp-top"><Bar w={30} h={12} tone="ink" /><i className="sk-badge" /></div><Para lines={3} /><Checklist n={2} mark="·" /></div>)}</Block></>,
  '/mechanism': () => <><Head /><Row cols="1fr 280px"><Card><Network layered /></Card><Card><Para lines={8} /></Card></Row></>,
  '/assays': () => <><Head /><Table rows={4} cols={9} /><Card title={28}><Gantt /></Card></>,
  '/power': () => <><Head /><Row cols="1fr 1.4fr"><Card><Fields n={6} /></Card><Card><Curve /></Card></Row></>,
  '/aims': () => <><Head /><Doc sections={3} /></>,
  '/suspension': () => <><Head /><Stats n={3} /><div className="sk-findings">{[0, 1, 2].map((i) => <Block z={14 + i * 3} key={i} className={`sk-finding s${i}`}><Bar w={36} h={10} tone="ink" /><Para lines={3} /></Block>)}</div></>,
  '/graph': () => <><Head /><Block z={20} className="sk-search"><i className="sk-well" /><Chips n={5} w={8} /></Block><Row cols="1fr 300px"><Card><Network /></Card><Card><Checklist n={6} mark="·" /></Card></Row></>,
  '/theory': () => <><Head /><Row cols="214px 1fr"><Block z={10} className="sk-toc">{Array.from({ length: 12 }, (_, i) => <Bar key={i} w={50 + ((i * 19) % 45)} h={9} tone={i === 0 ? 'accent' : undefined} />)}</Block><div className="sk-stack"><Card title={40}><Para lines={6} /><i className="sk-plate" /></Card><Card title={36}><Para lines={5} /></Card></div></Row></>,
  '/evidence': () => <><Head /><Row cols="1fr 1.3fr"><Card><Fields n={4} /></Card><Card><Hits n={3} /></Card></Row></>,
  '/review': () => <><Head /><Block z={18} className="sk-presets">{Array.from({ length: 6 }, (_, i) => <div key={i}><Bar w={60} h={10} tone="ink" /><Bar w={85} h={7} /></div>)}</Block><Chat /></>,
}

/**
 * The Suspense fallback while a page's code arrives: that page's blueprint.
 * `/shared/:id` and unknown routes get a generic two-card sheet.
 */
export function RouteSkeleton({ path }: { path: string }) {
  const bp = BLUEPRINTS[path] ?? (() => <><Head /><Row><Card><Para lines={5} /></Card><Card><Para lines={5} /></Card></Row></>)
  return (
    <div className="sk-page" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="sk-scan" aria-hidden="true" />
      {bp()}
    </div>
  )
}

// ---------- async skeletons ----------

export type SkKind =
  | 'answer' | 'critique' | 'protocol' | 'extraction' | 'pages' | 'hits' | 'sources' | 'triage'
  | 'citations' | 'records' | 'abstract' | 'reading' | 'finer' | 'letter' | 'results' | 'polish'
  | 'aims' | 'audit' | 'theory' | 'sync' | 'snapshot' | 'revision' | 'notices'

const LABELS: Record<SkKind, string> = {
  answer: 'Composing an answer', critique: 'Pressure-testing the hypothesis', protocol: 'Drafting the SOP',
  extraction: 'Extracting the 2×2', pages: 'Reading the PDF', hits: 'Searching PubMed', sources: 'Searching every source',
  triage: 'Triaging relevance', citations: 'Finding the latest papers', records: 'Fetching records', abstract: 'Loading the abstract',
  reading: 'Assembling a reading list', finer: 'Checking against FINER', letter: 'Drafting responses', results: 'Writing the results',
  polish: 'Polishing the prose', aims: 'Polishing the aims', audit: 'Reviewing the design', theory: 'Building the theory',
  sync: 'Syncing', snapshot: 'Opening the shared project', revision: 'Reviewing new evidence',
  notices: 'Checking publication notices',
}

function body(kind: SkKind, parts?: string[]): ReactNode {
  switch (kind) {
    case 'answer':
      return <><Bar w={42} h={13} tone="accent" /><Para lines={3} /><Checklist n={3} mark="•" /><Para lines={2} /></>
    case 'critique':
      return <div className="sk-verdicts">{['Falsifiability', 'Weakest confounder', 'Key experiment'].map((t, i) => <Block z={8 + i * 6} key={t} className="sk-verdict-card"><b>{t}</b><Para lines={2} /></Block>)}</div>
    case 'protocol':
      return <div className="sk-steps">{Array.from({ length: 5 }, (_, i) => <div key={i}><b>{i + 1}</b><Para lines={i % 2 ? 2 : 1} /></div>)}</div>
    case 'extraction':
      return <div className="sk-2x2"><span /><b>Event</b><b>No event</b><b>{parts?.[0] ?? 'Index'}</b><i /><i /><b>{parts?.[1] ?? 'Comparator'}</b><i /><i /></div>
    case 'pages':
      return <div className="sk-pdf">{[0, 1, 2, 3].map((i) => <div key={i} style={{ ['--i' as string]: i } as CSSProperties}><Para lines={5} gap={6} /></div>)}</div>
    case 'hits':
      return <Hits n={3} />
    case 'triage':
      return <Hits n={3} verdicts />
    case 'sources':
      return <div className="sk-sources">{(parts ?? ['PubMed', 'Europe PMC', 'CrossRef', 'ClinicalTrials.gov']).map((s, i) => <Block z={8 + i * 4} key={s} className="sk-source"><b>{s}</b><Bar w={80} h={8} /><Bar w={60} h={8} /></Block>)}</div>
    case 'citations':
      return <ol className="sk-cites">{[0, 1, 2].map((i) => <li key={i}><Bar w={88 - i * 9} h={9} tone="ink" /><Bar w={46} h={7} tone="soft" /></li>)}</ol>
    case 'records':
      return <Records n={2} />
    case 'abstract':
      return <Para lines={4} gap={7} />
    case 'reading':
      return <Checklist n={5} mark="◆" />
    case 'finer':
      return <div className="sk-finer">{['F', 'I', 'N', 'E', 'R'].map((k) => <div key={k}><b>{k}</b><Bar w={70} h={9} /></div>)}</div>
    case 'letter':
      // point-by-point: each reviewer point gets its response
      return <div className="sk-letter">{(parts?.length ? parts.slice(0, 4) : ['', '']).map((p, i) => <div key={i}>{p ? <b>{p}</b> : <Bar w={24} h={9} tone="accent" />}<Para lines={i % 2 ? 2 : 3} /></div>)}</div>
    case 'results':
      return <><Para lines={4} /><div className="sk-numbers">{[0, 1, 2].map((i) => <i key={i} />)}</div></>
    case 'polish':
      // a structured abstract, then the discussion
      return (
        <div className="sk-abstract">
          {['Background', 'Methods', 'Results', 'Conclusions'].map((h, i) => <div key={h}><b>{h}</b><Para lines={i === 2 ? 3 : 2} /></div>)}
          <div className="sk-discussion"><Bar w={26} h={12} tone="accent" /><Para lines={4} /></div>
        </div>
      )
    case 'aims':
      // one page: the hook paragraph, then each aim in its box
      return (
        <>
          <Para lines={3} />
          <div className="sk-aims">{(parts?.length ? parts : ['Aim 1', 'Aim 2', 'Aim 3']).map((p) => <div key={p}><b>{p}</b><Bar w={70} h={10} tone="ink" /><Para lines={2} /></div>)}</div>
        </>
      )
    case 'audit':
      return <div className="sk-findings mini">{[0, 1, 2].map((i) => <div key={i} className={`sk-finding s${i}`}><Bar w={40} h={9} tone="ink" /><Para lines={2} /></div>)}</div>
    case 'theory':
      // a chapter being written: the contents fill in beside the first section
      return (
        <div className="sk-chapter">
          <div className="sk-toc">{Array.from({ length: 7 }, (_, i) => <Bar key={i} w={48 + ((i * 19) % 44)} h={8} tone={i === 0 ? 'accent' : undefined} />)}</div>
          <div className="sk-chapter-body"><Bar w={56} h={16} tone="ink" /><Para lines={4} /><i className="sk-plate short" /><Para lines={3} /></div>
        </div>
      )
    case 'revision':
      // current evidence update → proposed one, linked to its source passages
      return (
        <div className="sk-compare">
          <div className="was"><Bar w={40} h={7} tone="soft" /><Para lines={3} /></div>
          <b aria-hidden="true">→</b>
          <div className="now"><Bar w={44} h={7} tone="accent" /><Para lines={4} /><div className="sk-links"><i /><i /><i /></div></div>
        </div>
      )
    case 'notices':
      return <div className="sk-tickets">{[0, 1, 2].map((i) => <div key={i} style={{ ['--i' as string]: i } as CSSProperties}><i className="sk-doi" /><Bar w={58 - i * 9} h={8} /><i className="sk-stamp" /></div>)}</div>
    case 'sync':
      return <div className="sk-sync"><i /><i /><i /><b>☁</b></div>
    case 'snapshot':
      return <><Bar w={50} h={16} tone="ink" /><Stats n={3} z={10} /><Para lines={3} /></>
  }
}

/**
 * An in-place skeleton for something that is loading or being generated.
 * `parts` names what is actually being fetched where a blueprint has lanes
 * (the sources being searched), so the skeleton never promises more.
 */
export function Sk({ kind, label, parts }: { kind: SkKind; label?: string; parts?: string[] }) {
  // the label animates its own ellipsis, so drop one a caller's text brings
  const text = (label ?? (kind === 'sources' && parts?.length === 1 ? `Searching ${parts[0]}` : LABELS[kind])).replace(/…$/, '')
  return (
    <div className={`sk-async sk-${kind}`} role="status" aria-busy="true" aria-live="polite">
      <div className="sk-label"><i className="sk-cube" aria-hidden="true" />{text}<span className="sk-ellipsis" aria-hidden="true"><i /><i /><i /></span></div>
      <div className="sk-async-body" aria-hidden="true">{body(kind, parts)}</div>
    </div>
  )
}
