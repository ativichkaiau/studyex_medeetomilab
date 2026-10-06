import type { RobLevel, Study } from '../types'

/** judgements as the validation layer prints them */
export const ROB_LABEL: Record<RobLevel, string> = { low: 'LOW', some: 'SOME_CONCERNS', high: 'HIGH' }
export const ROB_TONE: Record<RobLevel, 'ok' | 'warn' | 'bad'> = { low: 'ok', some: 'warn', high: 'bad' }
export const ROB_LEVELS: RobLevel[] = ['low', 'some', 'high']

/**
 * A study's overall judgement: its worst rated domain. Unrated domains are
 * not assumed to be anything; a study with no rated domain has no overall.
 */
export function overallRob(s: Study, domains: string[]): RobLevel | undefined {
  const vals = domains.map((d) => s.rob?.[d]).filter(Boolean) as RobLevel[]
  if (!vals.length) return undefined
  if (vals.includes('high')) return 'high'
  if (vals.includes('some')) return 'some'
  return 'low'
}

/** every domain rated */
export const robComplete = (s: Study, domains: string[]) => domains.length > 0 && domains.every((d) => s.rob?.[d])
