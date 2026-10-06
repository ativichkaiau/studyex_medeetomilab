import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

function offlineAssets() {
  return {
    name: 'offline-assets',
    apply: 'build' as const,
    async closeBundle() {
      const out = resolve('dist')
      async function files(dir: string): Promise<string[]> {
        const entries = await readdir(dir, { withFileTypes: true })
        return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat()
      }
      const built = (await files(out)).filter((path) => !path.endsWith('/sw.js')).sort()
      const hash = createHash('sha256')
      for (const path of built) { hash.update(relative(out, path)); hash.update(await readFile(path)) }
      const precache = built.map((path) => '/' + relative(out, path).replaceAll('\\', '/'))
      const template = await readFile(resolve('public/sw.js'), 'utf8')
      const script = template.replace("const CACHE = 'medeetomilab-dev'", `const CACHE = 'medeetomilab-${hash.digest('hex').slice(0, 12)}'`)
        .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(precache)}`)
      await writeFile(join(out, 'sw.js'), script)
    },
  }
}

// studyex_medeetomilab — Vite + React + TS. Frontend-first MVP; no backend required in v1.
export default defineConfig({
  plugins: [react(), offlineAssets()],
  server: { port: 5173, open: false },
})
