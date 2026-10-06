import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'

const vite = await createServer({ server: { middlewareMode: true, hmr: { server: createHttpServer() } }, appType: 'custom' })
after(() => vite.close())
const { blankProject } = await vite.ssrLoadModule('/src/data/seed.ts')
const { extractionCsv } = await vite.ssrLoadModule('/src/lib/extractionExport.ts')
const { parseStudies } = await vite.ssrLoadModule('/src/lib/importStudies.ts')
const { pipeline, projectState } = await vite.ssrLoadModule('/src/lib/pipeline.ts')
const { isRegistered } = await vite.ssrLoadModule('/src/lib/projectFacts.ts')
const { posterDoc, slidesDoc } = await vite.ssrLoadModule('/src/lib/dissemination.ts')

test('extraction CSV reimports decisions, domains, author and multiline notes', () => {
  const state = blankProject('x', 'A review', 'REV')
  state.review.robDomains = ['Selection bias', 'Missing outcome data']
  state.review.studies = [{
    id: 'study_1', author: 'Smith and Jones, et al', year: 2020, include: false,
    expEvents: 2, expTotal: 10, ctrlEvents: 3, ctrlTotal: 12,
    n1: 10, n2: 12, cohort: { registration: 'NCT123', name: 'North, South' },
    rob: { 'Selection bias': 'some', 'Missing outcome data': 'high' },
    note: 'Line one, "quoted"\nLine two',
  }]
  const csv = extractionCsv(state.review)
  const imported = parseStudies(csv)
  assert.equal(imported.studies.length, 1)
  assert.equal(imported.studies[0].author, state.review.studies[0].author)
  assert.equal(imported.studies[0].include, false)
  assert.equal(imported.studies[0].n1, 10)
  assert.equal(imported.studies[0].n2, 12)
  assert.deepEqual(imported.studies[0].cohort, { registration: 'NCT123', name: 'North, South', centers: undefined, recruitmentStart: undefined, recruitmentEnd: undefined, population: undefined })
  assert.deepEqual(imported.studies[0].rob, state.review.studies[0].rob)
  assert.equal(imported.studies[0].note, state.review.studies[0].note)
})

test('planned registration stays unregistered across the pipeline', () => {
  const state = blankProject('x', 'A review', 'REV')
  assert.equal(isRegistered(state), false)
  state.review.registration = 'PROSPERO — to register'
  assert.equal(isRegistered(state), false)
  assert.equal(pipeline(state)[0].metrics.at(-1).v, 'no')
  state.review.registration = 'PROSPERO CRD42026123456'
  assert.equal(isRegistered(state), true)
  assert.equal(pipeline(state)[0].metrics.at(-1).v, 'yes')
  assert.equal(projectState(pipeline(state), []).label, 'IN PROGRESS')
})

test('exported poster and slide styles are scoped and titles escaped', () => {
  const poster = posterDoc('<Review & Notes>', '<div class="poster"></div>')
  const slides = slidesDoc('<Review & Notes>', '<section class="slide"></section>')
  assert.match(poster, /&lt;Review &amp; Notes>/)
  assert.match(slides, /&lt;Review &amp; Notes>/)
  assert.doesNotMatch(poster, /:root\{/)
  assert.doesNotMatch(slides, /:root\{/)
  assert.match(poster, /\.poster\{--navy:/)
  assert.match(slides, /\.deck\{--navy:/)
})
