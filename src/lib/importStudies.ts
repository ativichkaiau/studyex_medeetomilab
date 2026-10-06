import type { Study, RobLevel } from '../types'

// ============================================================
// Import studies from a CSV (with optional 2×2 counts) or an
// RIS export (references only). Column names are matched loosely
// so common screener / reference-manager exports work.
// ============================================================

export type NewStudy = Omit<Study, 'id'>
export interface ImportResult {
  studies: NewStudy[]
  format: 'csv' | 'ris'
  warnings: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const toNum = (v: string) => {
  const n = parseInt((v || '').replace(/[^0-9-]/g, ''), 10)
  return Number.isNaN(n) ? undefined : n
}
const toFloat = (v: string) => {
  const n = parseFloat((v || '').replace(/[^0-9.eE+-]/g, ''))
  return Number.isNaN(n) ? undefined : n
}

export function detectFormat(text: string): 'csv' | 'ris' {
  return /^\s*TY\s{0,2}-\s?/m.test(text) ? 'ris' : 'csv'
}

export function parseStudies(text: string): ImportResult {
  const format = detectFormat(text)
  return format === 'ris' ? { format, ...parseRIS(text) } : { format, ...parseCSV(text) }
}

// ---- CSV ----
function splitCSVRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      cur = ''
    }
    else cur += ch
  }
  row.push(cur)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

function parseCSV(text: string): { studies: NewStudy[]; warnings: string[] } {
  const rows = splitCSVRows(text)
  const warnings: string[] = []
  if (rows.length < 2) return { studies: [], warnings: ['No data rows found.'] }
  const rawHeader = rows[0]
  const header = rawHeader.map(norm)
  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = header.indexOf(norm(a))
      if (i >= 0) return i
    }
    return -1
  }
  const cols = {
    author: idx(['author', 'authors', 'firstauthor', 'study', 'name', 'studyid', 'covidencenumber']),
    year: idx(['year', 'py', 'publicationyear']),
    pmid: idx(['pmid', 'pubmedid', 'pubmed']),
    doi: idx(['doi']),
    registration: idx(['trialregistration', 'registration', 'trialid', 'nct']),
    cohortName: idx(['cohortname', 'cohort']),
    centers: idx(['centers', 'centres', 'sites', 'institutions']),
    recruitmentStart: idx(['recruitmentstart']),
    recruitmentEnd: idx(['recruitmentend']),
    population: idx(['population']),
    design: idx(['design', 'studydesign', 'type']),
    expEvents: idx(['expevents', 'indexevents', 'spontaneousevents', 'eventsexposed', 'eventsindex', 'e1', 'ai']),
    expTotal: idx(['exptotal', 'indextotal', 'spontaneoustotal', 'nexposed', 'nindex', 'n1', 'totalindex']),
    ctrlEvents: idx(['ctrlevents', 'controlevents', 'comparatorevents', 'druginducedevents', 'eventscontrol', 'e2', 'ci']),
    ctrlTotal: idx(['ctrltotal', 'controltotal', 'comparatortotal', 'ncontrol', 'n2', 'totalcontrol']),
    mean1: idx(['mean1', 'indexmean', 'meanindex', 'm1']),
    sd1: idx(['sd1', 'indexsd', 'stdev1', 'sdindex']),
    n1: idx(['n1', 'indexn', 'ngroup1']),
    mean2: idx(['mean2', 'controlmean', 'comparatormean', 'meancontrol', 'm2']),
    sd2: idx(['sd2', 'controlsd', 'stdev2', 'sdcontrol']),
    n2: idx(['n2', 'controln', 'ngroup2']),
    subgroup: idx(['subgroup', 'group', 'stratum']),
    include: idx(['include', 'included', 'poolinginclude']),
    note: idx(['note', 'notes']),
  }
  const robColumns = rawHeader.flatMap((name, i) => name.toLowerCase().startsWith('rob:') ? [{ domain: name.slice(4), i }] : [])
  const studies: NewStudy[] = []
  for (let r = 1; r < rows.length; r++) {
    const f = rows[r]
    const g = (i: number) => (i >= 0 ? (f[i] ?? '').trim() : '')
    const authorRaw = g(cols.author) || `Study ${r}`
    const rob: Record<string, RobLevel> = {}
    robColumns.forEach(({ domain, i }) => {
      const level = g(i)
      if (level === 'low' || level === 'some' || level === 'high') rob[domain] = level
    })
    const includeValue = g(cols.include).toLowerCase()
    studies.push({
      author: authorRaw,
      year: toNum(g(cols.year)) ?? 0,
      pmid: g(cols.pmid) || undefined,
      doi: g(cols.doi) || undefined,
      cohort: { registration: g(cols.registration) || undefined, name: g(cols.cohortName) || undefined, centers: g(cols.centers) || undefined, recruitmentStart: g(cols.recruitmentStart) || undefined, recruitmentEnd: g(cols.recruitmentEnd) || undefined, population: g(cols.population) || undefined },
      design: g(cols.design) || undefined,
      expEvents: toNum(g(cols.expEvents)),
      expTotal: toNum(g(cols.expTotal)),
      ctrlEvents: toNum(g(cols.ctrlEvents)),
      ctrlTotal: toNum(g(cols.ctrlTotal)),
      mean1: toFloat(g(cols.mean1)),
      sd1: toFloat(g(cols.sd1)),
      n1: toNum(g(cols.n1)),
      mean2: toFloat(g(cols.mean2)),
      sd2: toFloat(g(cols.sd2)),
      n2: toNum(g(cols.n2)),
      subgroup: g(cols.subgroup) || undefined,
      include: cols.include < 0 || !['no', 'false', '0', 'exclude', 'excluded'].includes(includeValue),
      rob: Object.keys(rob).length ? rob : undefined,
      note: cols.note >= 0 ? f[cols.note] || undefined : undefined,
    })
  }
  if (cols.author < 0) warnings.push('No author/study column found — using row numbers.')
  if (cols.expTotal < 0 || cols.ctrlTotal < 0) warnings.push('No 2×2 event columns found — add counts per study after import.')
  return { studies, warnings }
}

// ---- RIS ----
function parseRIS(text: string): { studies: NewStudy[]; warnings: string[] } {
  const records = text.split(/\r?\n(?=TY\s{0,2}-\s?)/)
  const studies: NewStudy[] = []
  for (const rec of records) {
    if (!/TY\s{0,2}-/.test(rec)) continue
    const get = (tags: string[]) => {
      for (const t of tags) {
        const m = rec.match(new RegExp(`^${t}\\s{0,2}-\\s?(.*)$`, 'm'))
        if (m) return m[1].trim()
      }
      return ''
    }
    const allAU = [...rec.matchAll(/^(?:AU|A1)\s{0,2}-\s?(.*)$/gm)].map((m) => m[1].trim())
    const author = allAU[0] || get(['A2'])
    const year = (get(['PY', 'Y1']).match(/\d{4}/) || [''])[0]
    const title = get(['TI', 'T1', 'T2'])
    let pmid = get(['C7', 'AN', 'ID'])
    if (!/^\d{6,9}$/.test(pmid)) {
      const m = (get(['UR', 'L2', 'L1']) + ' ' + rec).match(/pubmed\S*?(\d{6,9})/i) || rec.match(/\b(\d{7,9})\b/)
      pmid = m ? m[1] : ''
    }
    if (!author && !title) continue
    studies.push({
      author: (author.split(',')[0] || title.slice(0, 22)).trim() || 'Study',
      year: year ? +year : 0,
      pmid: /^\d{6,9}$/.test(pmid) ? pmid : undefined,
      doi: get(['DO']) || undefined,
      note: title || undefined,
      include: true,
    })
  }
  return { studies, warnings: ['RIS provides references only — add 2×2 event counts per study after import.'] }
}

export const CSV_TEMPLATE =
  'author,year,pmid,design,exp_events,exp_total,ctrl_events,ctrl_total,subgroup\n' +
  'Priori,2012,22851539,prospective cohort,10,120,5,180,Europe\n' +
  'Probst,2010,20124220,registry,18,320,9,410,Europe'
