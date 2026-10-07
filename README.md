<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/dexmedetomidine-dark.svg">
  <img src="public/brand/dexmedetomidine-light.svg" alt="Skeletal formula of dexmedetomidine, C13H16N2" width="96">
</picture>

# studyex_medeetomilab

A browser-based research runtime for evidence synthesis, systematic reviews, meta-analysis, research quality checks, and manuscript preparation. The interface presents each project as a structured record with a live pipeline, a searchable evidence registry, a context panel, and exportable artifacts.

The default view is flat graphite. A light theme, device-following theme, and optional 3D view are available in the top bar. Geist Sans and Geist Mono are bundled with the build. Existing `williamslab.*` browser storage keys are deliberately retained so saved projects continue to load.

## Research workflow

1. **Protocol** — define the question, PICO, eligibility criteria, search strings, and registration.
2. **Literature** — search sources, save references, tag evidence, and queue records.
3. **Screening** — classify title and abstract records, resolve reviewer conflicts, assess full texts, and compile PRISMA counts. The queue supports I/E/U decisions and J/K navigation.
4. **Extraction** — import or enter study data, inspect schema coverage and validation flags, review possible overlapping cohorts, and export a CSV table. The CSV reimports study values with new study IDs; use the project JSON export for a complete backup.
5. **Risk of bias** — choose an appraisal tool or custom domains, rate included studies, and export the summary figure.
6. **Statistics and PRISMA** — compute pooled estimates and diagnostics, log analysis runs, and reconcile selection counts with the screening log.
7. **Manuscript and artifacts** — inspect section and QA status, compile the draft, and export figures, references, search strategies, and project data.

The navigation also includes rigor findings, a knowledge graph, hypotheses, mechanism work, evidence tracing, Theory, assays, power, aims, dashboard, portfolio, and LitLink. The command palette (⌘K or Ctrl+K) searches pages and project records. Terra proposes page-specific tasks in its input; nothing is sent automatically. It uses a key supplied by the user in the browser.

The BrS-EPI seed project is a research example. New projects and imported project JSON are stored locally. Optional Supabase sync exchanges project data across signed-in devices and resolves conflicting edits with a user choice. Database setup is in `db/supabase-schema.sql`.

## Run and verify

Requires Node.js 18 or newer.

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The Vite development server defaults to `http://localhost:5173`. The production build is written to `dist/`. This is a static HashRouter app, so a host needs no route rewrites. `vercel.json` configures a Vercel build when the repository is imported there.

## API keys and sync

OpenAI features run in the browser with a user-provided key. Enter it under **Knowledge review → Settings**. Do not put `VITE_OPENAI_API_KEY` into a public deployment: Vite would embed it in client code.

Cloud sync uses a user-owned Supabase project. Apply `db/supabase-schema.sql`, open **Cloud**, enter the project URL and public anon key, then sign in. Do not enter a service-role secret. The Cloud panel shows local, checking, synced, paused, offline, error, and conflict states. The first connection retains a local backup before applying remote data.

## Project data and exports

Browser storage is the default persistence layer. Export the complete project JSON from **Overview** or **Artifacts** for a portable backup. CSV is for the extraction table, and its import appends studies with fresh IDs. Figure exports are SVG, PNG, or PDF. Manuscript output is Markdown or HTML from the manuscript page.

The evidence model retains exact source passages apart from interpretations. Theory revisions require approval. Linked secondary reports remain available while one selected report contributes to pooling for an outcome.

## Design and deployment

The logo is the skeletal formula of dexmedetomidine (C<sub>13</sub>H<sub>16</sub>N<sub>2</sub>, [PubChem CID 5311068](https://pubchem.ncbi.nlm.nih.gov/compound/5311068)), drawn with its bonds in the text colour and its two nitrogens in the accent blue. `public/icon.svg` and its PNG renders carry the full structure. `public/favicon.svg` uses a heavier mark that stays legible at tab size. `public/brand/dexmedetomidine-dark.svg` and `dexmedetomidine-light.svg` are transparent versions for dark and light backgrounds. In the app, `src/components/Molecule.tsx` draws both forms from the same coordinates. PWA files are `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`, `public/icon-180.png`, and `public/icon-512.png`. The production build writes a versioned service worker that precaches the shell, route chunks, styles, icons, and bundled fonts; external research/API requests go to the network.

The interface supports reduced motion and keyboard focus. The optional 3D layer uses the same graphite, blue, teal, and status colours as the flat design. Verify the built app at desktop and phone widths before deploying a redesign.
