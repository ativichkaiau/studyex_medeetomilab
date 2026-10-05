/**
 * Display identifiers — REC_3KF9Q, STUDY_0A7XM, RIGOR_K2W1D.
 *
 * Records keep their internal ids (UUIDs, `st_…`, `inst_…`); these are short,
 * stable labels derived from them, so a record reads the same in a table, an
 * inspector, the command palette and an audit entry, and keeps its label when
 * others are added or removed. Nothing is stored.
 */

function fnv1a(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** five base-36 characters: ~60M codes, so a few hundred records won't collide in practice */
export const shortCode = (id: string) => fnv1a(id).toString(36).toUpperCase().padStart(5, '0').slice(-5)

export const recId = (id: string) => `REC_${shortCode(id)}`
export const studyId = (id: string) => `STUDY_${shortCode(id)}`
export const rigorId = (id: string) => `RIGOR_${shortCode(id)}`
export const dxId = (id: string) => `DX_${shortCode(id)}`
