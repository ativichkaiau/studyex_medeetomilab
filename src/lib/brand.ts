/**
 * Brand constants: the one place the product's name and its treatments live.
 *
 * studyex_medeetomilab is the research runtime inside the VESTRIPPN
 * ecosystem, sibling to studyex_medeetomihub. The name is lowercase with an
 * intentional underscore, treated like a package or a service rather than a
 * product logo.
 *
 * Storage keys elsewhere keep their original `williamslab.*` prefixes on
 * purpose: they're internal, and renaming them would orphan saved projects.
 */
export const BRAND = {
  /** canonical name */
  name: 'studyex_medeetomilab',
  /** primary visual treatment: the trailing underscore stands like a cursor */
  mark: 'studyex_medeetomilab_',
  /** short form for tight spaces (phones) */
  short: 'medeetomilab_',
  /** technical treatments */
  uri: 'studyex://medeetomilab',
  dotted: 'studyex.medeetomilab',
  runtime: 'research runtime',
  namespace: 'VESTRIPPN',
  sibling: 'studyex_medeetomihub',
  /** root document title */
  title: 'studyex_medeetomilab // Research Runtime',
  description: 'Evidence synthesis, systematic review, meta-analysis, research QA, and manuscript environment.',
  /** the intelligence layer keeps its own name */
  terra: 'Terra',
  version: '0.2',
} as const

/**
 * The drug behind "medeetomi": dexmedetomidine, the (S)-enantiomer of medetomidine. Its skeletal
 * formula is the logo (components/Molecule.tsx, public/icon.svg, public/favicon.svg).
 */
export const MOLECULE = {
  name: 'dexmedetomidine',
  formula: 'C13H16N2',
  iupac: '5-[(1S)-1-(2,3-dimethylphenyl)ethyl]-1H-imidazole',
  pubchemCid: 5311068,
  url: 'https://pubchem.ncbi.nlm.nih.gov/compound/5311068',
} as const

/** "<code> // studyex_medeetomilab", the per-project document title */
export const projectTitle = (code: string, module?: string) =>
  `${code}${module ? ` · ${module}` : ''} // ${BRAND.name}`

/** filename stem for project exports, e.g. "brs-epi.medeetomilab.json" */
export const exportName = (code: string) => `${code.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}.medeetomilab.json`
