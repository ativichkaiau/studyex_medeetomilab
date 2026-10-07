import { MOLECULE } from '../lib/brand'

/**
 * The logo: dexmedetomidine (C13H16N2), drawn from ideal 2D coordinates in PubChem's orientation
 * (CID 5311068) — benzene below, the hashed methyl at the (S) stereocentre, the imidazole above.
 * Bonds take currentColor; the two nitrogens take the accent, like the underscore in the wordmark.
 * public/icon.svg, public/favicon.svg and public/brand/* are drawn from the same geometry.
 */

/** skeletal formula: Kekulé double bonds, hashed wedge, stroked N / HN labels (use at ≥ 56px) */
const FULL = {
  w: 179.23, h: 194.18,
  bonds: 'M71.48 111.98L36.84 131.98M36.84 131.98L36.84 171.98M44.84 139.18L44.84 164.78M36.84 171.98L71.48 191.98M71.48 191.98L106.12 171.98M73.72 181.45L95.89 168.65M106.12 171.98L106.12 131.98M106.12 131.98L71.48 111.98M95.89 135.31L73.72 122.51M71.48 111.98L71.48 71.98M36.84 131.98L2.2 111.98M36.84 171.98L2.2 191.98M71.48 71.98L106.12 51.98M106.12 51.98L108.8 26.52M124.39 9.21L149.43 3.88M149.43 3.88L162.23 26.05M146.1 14.12L154.94 29.43M159.79 49.23L142.67 68.25M142.67 68.25L106.12 51.98M139.34 58.01L115.95 47.6',
  hash: 'M67.64 67.44L65.63 70.92M62.3 62.93L59.05 68.55M56.96 58.42L52.47 66.18M51.62 53.9L45.9 63.82M46.28 49.39L39.32 61.45M40.94 44.88L32.74 59.08',
  letters: 'M102.7 22.2L102.7 2.2L117.9 22.2L117.9 2.2M79.5 22.2L79.5 2.2M94.7 22.2L94.7 2.2M79.5 12.2L94.7 12.2M161.83 48.52L161.83 28.52L177.03 48.52L177.03 28.52',
}

/** small mark: the same skeleton in one heavy line, nitrogens as dots (reads down to ~20px) */
const MARK = {
  w: 191.23, h: 203.78,
  bonds: 'M75.28 117.78L40.64 137.78M40.64 137.78L40.64 177.78M40.64 177.78L75.28 197.78M75.28 197.78L109.92 177.78M109.92 177.78L109.92 137.78M109.92 137.78L75.28 117.78M75.28 117.78L75.28 77.78M40.64 137.78L6 117.78M40.64 177.78L6 197.78M75.28 77.78L109.92 57.78M109.92 57.78L114.1 18M114.1 18L153.23 9.68M153.23 9.68L173.23 44.33M173.23 44.33L146.47 74.05M146.47 74.05L109.92 57.78',
  hash: 'M71.49 73.15L69.37 76.82M58.32 61.57L52.76 71.2M45.14 49.99L36.14 65.58',
  dots: [[114.1, 18], [173.23, 44.33]],
}

const DESCRIPTION = `${MOLECULE.name}, ${MOLECULE.formula}`

type Props = {
  /** rendered height in px */
  size?: number
  className?: string
  /** accessible name; '' (or omitted, for DexMark) when adjacent text already names it */
  title?: string
}

const a11y = (title?: string) => title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true }

export function DexMark({ size = 22, className, title }: Props) {
  return (
    <svg className={`dex dex-mark${className ? ` ${className}` : ''}`} viewBox={`0 0 ${MARK.w} ${MARK.h}`}
      height={size} width={+(size * MARK.w / MARK.h).toFixed(1)} focusable="false" {...a11y(title)}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK.bonds} strokeWidth={11} />
        <path d={MARK.hash} strokeWidth={9.35} />
      </g>
      {MARK.dots.map(([cx, cy]) => <circle key={cx} className="dex-n" cx={cx} cy={cy} r={12} />)}
    </svg>
  )
}

export function DexStructure({ size = 88, className, title = DESCRIPTION }: Props) {
  return (
    <svg className={`dex dex-structure${className ? ` ${className}` : ''}`} viewBox={`0 0 ${FULL.w} ${FULL.h}`}
      height={size} width={+(size * FULL.w / FULL.h).toFixed(1)} focusable="false" {...a11y(title)}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={FULL.bonds} strokeWidth={3.4} />
        <path d={FULL.hash} strokeWidth={2.89} />
        <path className="dex-n-label" d={FULL.letters} strokeWidth={3.4} />
      </g>
    </svg>
  )
}

/** a molecular formula typeset with subscripts: C13H16N2 → C₁₃H₁₆N₂ */
export function Formula({ value = MOLECULE.formula }: { value?: string }) {
  return <span className="formula">{value.split(/(\d+)/).map((part, i) => (i % 2 ? <sub key={i}>{part}</sub> : part))}</span>
}
