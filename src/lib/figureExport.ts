// Unified figure export: turn any in-app <svg> into a downloadable PNG, SVG,
// or single-page PDF — no external libraries, no backend.
//
// The SRMA plots and theory diagrams colour themselves with CSS custom
// properties (var(--ink) …). Those don't resolve in a standalone SVG, so we
// snapshot the *light-theme* values of the variables into a <style> on the
// exported root — keeping exports legible on a white ground even in night mode.

const VAR_NAMES = [
  '--ink', '--ink-2', '--muted', '--line', '--card', '--card-2', '--paper',
  '--blue', '--navy', '--red', '--amber', '--violet', '--green',
  '--good', '--good-ink', '--bad', '--bad-ink', '--warn', '--warn-ink',
  '--yellow', '--chip', '--chip-ink', '--accent',
  '--font-ui', '--font-mono', '--sans', '--mono',
]

function readLightVars(): string {
  const root = document.documentElement
  const prev = root.getAttribute('data-theme')
  root.setAttribute('data-theme', 'day') // force light values (legible on white)
  const cs = getComputedStyle(root)
  const decls = VAR_NAMES.map((n) => `${n}:${cs.getPropertyValue(n).trim()}`).join(';')
  if (prev) root.setAttribute('data-theme', prev)
  else root.removeAttribute('data-theme')
  return decls
}

export function serializeSvg(svg: SVGSVGElement): { xml: string; w: number; h: number } {
  const vb = svg.viewBox?.baseVal
  const w = Math.round((vb && vb.width) || svg.clientWidth || 800)
  const h = Math.round((vb && vb.height) || svg.clientHeight || 500)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const NS = 'http://www.w3.org/2000/svg'
  const style = document.createElementNS(NS, 'style')
  style.textContent = `svg{${readLightVars()}}`
  const rect = document.createElementNS(NS, 'rect')
  rect.setAttribute('x', '0')
  rect.setAttribute('y', '0')
  rect.setAttribute('width', '100%')
  rect.setAttribute('height', '100%')
  rect.setAttribute('fill', '#ffffff')
  clone.insertBefore(rect, clone.firstChild)
  clone.insertBefore(style, clone.firstChild)
  const xml = new XMLSerializer().serializeToString(clone)
  return { xml, w, h }
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function exportSvgFile(svg: SVGSVGElement, name: string) {
  const { xml } = serializeSvg(svg)
  triggerDownload(new Blob([xml], { type: 'image/svg+xml' }), `${name}.svg`)
}

function rasterize(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const { xml, w, h } = serializeSvg(svg)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('SVG rasterisation failed'))
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  })
}

export async function exportPngFile(svg: SVGSVGElement, name: string, scale = 2) {
  const canvas = await rasterize(svg, scale)
  await new Promise<void>((res) =>
    canvas.toBlob((b) => {
      if (b) triggerDownload(b, `${name}.png`)
      res()
    }, 'image/png'),
  )
}

// Minimal single-page PDF embedding a JPEG of the figure (DCTDecode).
function jpegToPdf(jpeg: Uint8Array, w: number, h: number): Uint8Array {
  const enc = new TextEncoder()
  const parts: (string | Uint8Array)[] = []
  const offset: number[] = []
  let len = 0
  const push = (s: string | Uint8Array) => {
    parts.push(s)
    len += typeof s === 'string' ? enc.encode(s).length : s.length
  }
  const obj = (n: number, body: string) => {
    offset[n] = len
    push(`${n} 0 obj\n${body}\nendobj\n`)
  }
  push('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offset[4] = len
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  push(jpeg)
  push('\nendstream\nendobj\n')
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n`)
  for (let i = 1; i <= 5; i++) push(`${String(offset[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)

  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    const b = typeof p === 'string' ? enc.encode(p) : p
    out.set(b, o)
    o += b.length
  }
  return out
}

export async function exportPdfFile(svg: SVGSVGElement, name: string, scale = 2) {
  const canvas = await rasterize(svg, scale)
  const jpeg = await new Promise<Uint8Array>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((ab) => res(new Uint8Array(ab))) : rej(new Error('jpeg encode failed'))),
      'image/jpeg',
      0.92,
    ),
  )
  const pdf = jpegToPdf(jpeg, canvas.width, canvas.height)
  triggerDownload(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `${name}.pdf`)
}
