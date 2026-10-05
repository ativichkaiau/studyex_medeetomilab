import { Link } from 'react-router-dom'
import type { SyncStatus } from '../lib/cloudSync'
import type { Dim } from '../lib/dimension'
import { BRAND } from '../lib/brand'

export interface StatusFacts {
  code: string
  records: number
  included: number
  rigor: number
  openIssues: number
  terraReady: boolean
  dim: Dim
}

/** what the cloud reports, in the bar's words */
export function syncWord(s: SyncStatus | null): { word: string; tone: 'ok' | 'warn' | 'bad' | 'idle' | 'info' } {
  if (!s) return { word: 'local', tone: 'idle' }
  switch (s.phase) {
    case 'synced': return { word: 'ok', tone: 'ok' }
    case 'checking': return { word: 'checking', tone: 'info' }
    case 'pending': return { word: 'pending', tone: 'warn' }
    case 'paused': return { word: 'paused', tone: 'idle' }
    case 'offline': return { word: 'offline', tone: 'bad' }
    case 'conflict': return { word: 'conflict', tone: 'bad' }
    case 'error': return { word: 'error', tone: 'bad' }
    default: return { word: String(s.phase), tone: 'idle' }
  }
}

/**
 * The workstation's bottom line. Every item is a live reading from the
 * project or the runtime, and each opens what it reports on.
 */
export default function StatusBar({ facts, sync, onCloud, onTerra, onPalette, onDim }: {
  facts: StatusFacts
  sync: SyncStatus | null
  onCloud: () => void
  onTerra: () => void
  onPalette: () => void
  onDim: () => void
}) {
  const s = syncWord(sync)
  const rigorTone = facts.rigor >= 0.75 ? 'ok' : facts.rigor >= 0.5 ? 'warn' : 'bad'
  return (
    <footer className="statusbar" aria-label="Status">
      <span className="sbar-item brand-item">{BRAND.name}</span>
      <Link className="sbar-item" to="/" title="Project overview"><b>{facts.code}</b></Link>
      <button className="sbar-item" onClick={onCloud} title={sync?.message || 'Cloud sync — not connected; data is saved in this browser'}>
        sync: <span className={`tone-${s.tone}`}>{s.word}</span>
      </button>
      <Link className="sbar-item" to="/screening" title="Screening records">records: <b>{facts.records}</b></Link>
      <Link className="sbar-item" to="/studies" title="Studies included in extraction">included: <b>{facts.included}</b></Link>
      <Link className="sbar-item" to="/suspension" title={`${facts.openIssues} open rigor issues`}>
        rigor: <span className={`tone-${rigorTone}`}>{Math.round(facts.rigor * 100)}%</span>
      </Link>
      <button className="sbar-item" onClick={onTerra} title={facts.terraReady ? 'Open Terra' : 'Terra needs an OpenAI key (Knowledge review → Settings)'}>
        terra: <span className={facts.terraReady ? 'tone-ok' : 'tone-idle'}>{facts.terraReady ? 'ready' : 'off'}</span>
      </button>
      <span className="sbar-sp" />
      <button className="sbar-item" onClick={onDim} title="Switch the interface between flat and 3D (⇧D)">view: <b>{facts.dim}</b></button>
      <button className="sbar-item" onClick={onPalette} title="Command palette">⌘K</button>
    </footer>
  )
}
