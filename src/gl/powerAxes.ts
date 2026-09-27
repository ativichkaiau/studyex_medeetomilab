/**
 * Where the power surface's axes sit in its world (gl/powerSurface.ts), shared
 * with the component that lays HTML labels over it — kept apart from the WebGL
 * code so the page can place labels without loading the renderer.
 */
export interface SurfaceRange {
  nMin: number
  nMax: number
  multMin: number
  multMax: number
}

export const HEIGHT = 0.9 // world height of power = 1
export const DEPTH = 0.75 // half-depth of the effect axis

/** world x for a sample size */
export const X = (d: SurfaceRange, n: number) => ((n - d.nMin) / (d.nMax - d.nMin)) * 2 - 1
/** world z for an effect multiplier: larger effects lie further back, so the
 *  surface rises away from you like a hillside */
export const Z = (d: SurfaceRange, m: number) => DEPTH - ((m - d.multMin) / (d.multMax - d.multMin)) * DEPTH * 2
