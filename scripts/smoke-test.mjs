#!/usr/bin/env node
/**
 * Chronicle end-to-end smoke test.
 *
 * Drives the live API surface (Express routes + Drizzle/SQLite + the local LLM)
 * to verify the app works from start to finish. There is no unit-test framework
 * in this project; this script is the integration test.
 *
 * Prerequisites:
 *   - Server running (npm run dev:server) with OLLAMA_BASE_URL pointed at a
 *     running llama.cpp / Ollama server.
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Env:
 *   CHRONICLE_URL   API base (default http://localhost:3001/api)
 *   SKIP_LLM=1      Skip the LLM-dependent tests (fast, DB-only run)
 */

const BASE = process.env.CHRONICLE_URL || 'http://localhost:3001/api'
const SKIP_LLM = process.env.SKIP_LLM === '1' || process.argv.includes('--skip-llm')

let passed = 0
let failed = 0
const failures = []

const log = (s = '') => process.stdout.write(s + '\n')
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed') }

async function test(name, fn) {
  const start = Date.now()
  try {
    await fn()
    passed++
    log(`  ✓ ${name} (${Date.now() - start}ms)`)
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    log(`  ✗ ${name} (${Date.now() - start}ms)`)
    log(`      ${e.message}`)
  }
}

async function api(method, path, body, { raw = false, timeout = 30000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    if (raw) return res
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = text }
    return { status: res.status, json, headers: res.headers }
  } finally {
    clearTimeout(timer)
  }
}

// Shared state across tests
let projectId, chapterId, charId, char2Id, locId, ideaId, styleId

async function main() {
  log(`\nChronicle E2E smoke test → ${BASE}`)
  log(SKIP_LLM ? '(LLM tests skipped)\n' : '(LLM tests enabled; real model calls may take a while)\n')

  // ---- Preflight ----
  let health
  try { health = await api('GET', '/health', undefined, { timeout: 5000 }) } catch { health = null }
  if (!health || health.status !== 200) {
    log('✗ Server not reachable at ' + BASE)
    log('  Start it first:  npm run dev:server   (with OLLAMA_BASE_URL set)')
    process.exit(2)
  }

  log('Infrastructure')
  await test('GET /health returns ok', async () => {
    const r = await api('GET', '/health')
    assert(r.status === 200, `status ${r.status}`)
    assert(r.json.status === 'ok')
  })

  if (!SKIP_LLM) {
    await test('POST /llm/ping reaches the model', async () => {
      const r = await api('POST', '/llm/ping', undefined, { timeout: 60000 })
      assert(r.status === 200, `status ${r.status}`)
      assert(r.json.model, 'no model in response')
    })
    await test('GET /llm/models lists the loaded model', async () => {
      const r = await api('GET', '/llm/models', undefined, { timeout: 30000 })
      assert(r.status === 200, `status ${r.status}`)
      assert(Array.isArray(r.json.models) && r.json.models.length > 0, 'no models listed')
    })
  }

  log('\nProjects')
  await test('POST /projects creates a project', async () => {
    const r = await api('POST', '/projects', { title: 'E2E Test Novel', logline: 'A test', genre: 'fantasy', tone: 'epic' })
    assert(r.status === 200, `status ${r.status}`)
    assert(r.json.id, 'no id returned')
    projectId = r.json.id
  })
  await test('GET /projects includes the new project', async () => {
    const r = await api('GET', '/projects')
    assert(Array.isArray(r.json), 'not an array')
    assert(r.json.some(p => p.id === projectId), 'project missing from list')
  })
  await test('GET /projects/:id returns project + auto-created world & arc', async () => {
    const r = await api('GET', `/projects/${projectId}`)
    assert(r.json.project?.id === projectId, 'wrong project')
    assert(r.json.world, 'no default world foundation')
    assert(r.json.arc, 'no default story arc')
  })
  await test('PUT /projects/:id updates fields', async () => {
    const r = await api('PUT', `/projects/${projectId}`, { title: 'E2E Test Novel (edited)', targetWordCount: 120000 })
    assert(r.status === 200, `status ${r.status}`)
  })
  await test('PUT /projects/:id/settings clamps and persists', async () => {
    const r = await api('PUT', `/projects/${projectId}/settings`, {
      recentChaptersCount: 99, minRecentChapters: 2, maxRecentChapters: 6, minWordCountPerChapter: 100,
    })
    assert(r.status === 200, `status ${r.status}`)
    assert(r.json.settings.maxRecentChapters === 6, 'max not stored')
    assert(r.json.settings.recentChaptersCount <= 6, 'recentCount not clamped to max')
    assert(r.json.settings.minWordCountPerChapter === 500, 'word count not clamped to 500 floor')
  })

  log('\nWorld Foundation')
  await test('PUT /world then GET round-trips values', async () => {
    const put = await api('PUT', `/projects/${projectId}/world`, { cosmology: 'Two moons', history: 'An old war' })
    assert(put.status === 200, `status ${put.status}`)
    assert(put.json.cosmology === 'Two moons', 'cosmology not saved')
    const get = await api('GET', `/projects/${projectId}/world`)
    assert(get.json.cosmology === 'Two moons', 'cosmology not read back')
  })

  log('\nKnowledge Bank entities')
  await test('Characters: create / get / list', async () => {
    const c = await api('POST', `/projects/${projectId}/characters`, { name: 'Aria', personality: 'brave', motivation: 'find the truth' })
    assert(c.status === 200 && c.json.id, 'create failed')
    charId = c.json.id
    const c2 = await api('POST', `/projects/${projectId}/characters`, { name: 'Borin', personality: 'gruff' })
    char2Id = c2.json.id
    const one = await api('GET', `/projects/${projectId}/characters/${charId}`)
    assert(one.json.name === 'Aria', 'get returned wrong character')
    const list = await api('GET', `/projects/${projectId}/characters`)
    assert(list.json.length >= 2, 'list incomplete')
  })
  await test('Locations: create / list', async () => {
    const l = await api('POST', `/projects/${projectId}/locations`, { name: 'Highvale', region: 'North', description: 'A cold keep' })
    assert(l.status === 200 && l.json.id, 'create failed')
    locId = l.json.id
    const list = await api('GET', `/projects/${projectId}/locations`)
    assert(list.json.some(x => x.id === locId), 'location missing')
  })
  await test('Relationships: create between two characters', async () => {
    const r = await api('POST', `/projects/${projectId}/relationships`, { fromCharId: charId, toCharId: char2Id, type: 'ally', intensity: 4 })
    assert(r.status === 200 && r.json.id, 'create failed')
    const list = await api('GET', `/projects/${projectId}/relationships`)
    assert(list.json.length >= 1, 'relationship missing')
  })
  await test('Lore: create', async () => {
    const r = await api('POST', `/projects/${projectId}/lore`, { category: 'artifact', title: 'The Shard', content: 'A glowing relic', tags: 'magic' })
    assert(r.status === 200 && r.json.id, 'create failed')
  })
  await test('Arcs: create / list (incl. default Main Story)', async () => {
    const r = await api('POST', `/projects/${projectId}/arcs`, { name: 'Rising Action', status: 'active' })
    assert(r.status === 200, `status ${r.status}`)
    const list = await api('GET', `/projects/${projectId}/arcs`)
    assert(list.json.length >= 2, 'arc list incomplete')
  })
  await test('Threads: create', async () => {
    const r = await api('POST', `/projects/${projectId}/threads`, { name: 'The missing heir', urgency: 3, status: 'active' })
    assert(r.status === 200 && r.json.id, 'create failed')
  })
  await test('Foreshadowing: create', async () => {
    const r = await api('POST', `/projects/${projectId}/foreshadowing`, { setup: 'A locked door', plannedPayoff: 'It hides the heir' })
    assert(r.status === 200 && r.json.id, 'create failed')
  })
  await test('Ideas: create / toggle-used / clamp deviation', async () => {
    const r = await api('POST', `/projects/${projectId}/ideas`, { title: 'Twist ending', description: 'the mentor is the villain', category: 'plot' })
    assert(r.status === 200 && r.json.id, 'create failed')
    ideaId = r.json.id
    const tog = await api('POST', `/ideas/${ideaId}/toggle-used`)
    assert(tog.status === 200 && (tog.json.isUsed === 1 || tog.json.isUsed === true), 'toggle-used failed')
    const dev = await api('PUT', `/ideas/${ideaId}/deviation`, { deviationFactor: 150 })
    assert(dev.status === 200 && dev.json.deviationFactor === 100, 'deviation not clamped to 100')
    const list = await api('GET', `/projects/${projectId}/ideas`)
    assert(list.json.some(i => i.id === ideaId), 'idea missing from list')
  })

  log('\nStyle Profiles')
  await test('Create style profile and round-trip extracted profile', async () => {
    const profile = {
      sentenceLengthTendency: 'varied', metaphorDensity: 'moderate', vocabularyRegister: 'literary',
      pacingRhythm: 'moderate', dialogueToNarrationRatio: 0.4, descriptionDensity: 'immersive',
      povIntimacy: 'close', internalMonologue: 'occasional', voiceProfileStub: null, notes: 'test',
    }
    const r = await api('POST', `/projects/${projectId}/style-profiles`, { name: 'Test Style', extractedProfile: profile })
    assert(r.status === 200 && r.json.id, 'create failed')
    styleId = r.json.id
    assert(r.json.extractedProfile?.vocabularyRegister === 'literary', 'profile not round-tripped')
  })

  log('\nKnowledge Bank service')
  await test('KB upsert + search', async () => {
    const up = await api('POST', `/projects/${projectId}/kb`, { layer: 'PERMANENT', entityType: 'world', content: 'The realm of Highvale is cold.', version: 1 })
    assert(up.status === 200, `status ${up.status}`)
    const search = await api('GET', `/projects/${projectId}/kb?q=Highvale`)
    assert(Array.isArray(search.json), 'search did not return an array')
    assert(search.json.length >= 1, 'search found nothing')
  })

  log('\nChapters')
  await test('Create chapter (auto-numbered to 1)', async () => {
    const r = await api('POST', `/projects/${projectId}/chapters`, { title: 'The Beginning', styleProfileId: styleId })
    assert(r.status === 200 && r.json.id, 'create failed')
    assert(r.json.number === 1, `expected number 1, got ${r.json.number}`)
    chapterId = r.json.id
  })
  await test('Save manual version updates word count', async () => {
    const content = ('word '.repeat(50)).trim()
    const r = await api('POST', `/projects/${projectId}/chapters/${chapterId}/versions`, { content, passType: 'MANUAL' })
    assert(r.status === 200, `status ${r.status}`)
    assert(r.json.wordCount === 50, `expected 50 words, got ${r.json.wordCount}`)
  })
  await test('Save + read state snapshot', async () => {
    const r = await api('POST', `/projects/${projectId}/chapters/${chapterId}/snapshot`, {
      characterStates: [], locationStates: [], openThreads: [], newCanonFacts: ['The heir is alive'], worldChanges: [],
    })
    assert(r.status === 200, `status ${r.status}`)
    assert(Array.isArray(r.json.newCanonFacts) && r.json.newCanonFacts[0] === 'The heir is alive', 'snapshot not round-tripped')
  })

  log('\nContext assembly')
  await test('GET /context returns tiered context', async () => {
    const r = await api('GET', `/projects/${projectId}/context?chapterId=${chapterId}&chapterNumber=1&charIds=${charId}`)
    assert(r.status === 200, `status ${r.status}`)
    assert(typeof r.json.tier1 === 'string', 'tier1 missing')
    assert('tier2' in r.json && 'tier3' in r.json, 'tier2/tier3 missing')
  })

  log('\nTimeline & Export')
  await test('GET /timeline returns an events array', async () => {
    const r = await api('GET', `/projects/${projectId}/timeline`)
    assert(r.status === 200, `status ${r.status}`)
    assert(Array.isArray(r.json.events), 'no events array')
  })
  await test('POST /export/docx returns a .docx (zip) buffer', async () => {
    const res = await api('POST', `/projects/${projectId}/export/docx`, {}, { raw: true })
    assert(res.status === 200, `status ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    assert(ct.includes('wordprocessingml'), `unexpected content-type ${ct}`)
    const buf = Buffer.from(await res.arrayBuffer())
    assert(buf.length > 100, `buffer too small (${buf.length})`)
    assert(buf.slice(0, 2).toString() === 'PK', 'not a zip/docx file')
  })
  await test('GET /export/txt returns text', async () => {
    const res = await api('GET', `/projects/${projectId}/export/txt`, undefined, { raw: true })
    assert(res.status === 200, `status ${res.status}`)
    const txt = await res.text()
    assert(txt.length > 0, 'empty txt export')
  })
  await test('POST /export/bible returns a .docx (zip) buffer', async () => {
    const res = await api('POST', `/projects/${projectId}/export/bible`, {}, { raw: true })
    assert(res.status === 200, `status ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    assert(buf.slice(0, 2).toString() === 'PK', 'not a zip/docx file')
  })

  if (!SKIP_LLM) {
    log('\nLLM generation pipeline (real model)')
    await test('POST generate/outline produces an outline', async () => {
      const r = await api('POST', `/projects/${projectId}/chapters/${chapterId}/generate/outline`,
        { wordCount: 500, tension: 6, focus: 'Balanced', styleProfileId: styleId, characterIds: [charId], locationIds: [locId] },
        { timeout: 240000 })
      assert(r.status === 200, `status ${r.status}`)
      assert(r.json.success, 'success flag not set')
      assert(typeof r.json.outline === 'string' && r.json.outline.length > 20, 'empty/short outline')
    })
    await test('GET generate/draft streams SSE chunks', async () => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 120000)
      let gotChunk = false
      try {
        const res = await fetch(`${BASE}/projects/${projectId}/chapters/${chapterId}/generate/draft?styleProfileId=${styleId}`, { signal: ctrl.signal })
        assert(res.status === 200, `status ${res.status}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data: ')) continue
            const data = JSON.parse(t.slice(6))
            if (data.type === 'error') throw new Error('stream returned an error event')
            if (data.type === 'chunk' && data.content) { gotChunk = true; ctrl.abort(); break outer }
          }
        }
      } catch (e) {
        if (!gotChunk && e.name !== 'AbortError') throw e
      } finally {
        clearTimeout(timer)
      }
      assert(gotChunk, 'no streamed chunk received')
    })
    await test('POST finalize generates snapshot + triggers KB evolution', async () => {
      const r = await api('POST', `/projects/${projectId}/chapters/${chapterId}/finalize`,
        { characterIds: [charId], locationIds: [locId] }, { timeout: 240000 })
      assert(r.status === 200, `status ${r.status}`)
      assert(r.json.success && r.json.snapshot, 'no snapshot returned')
      const ch = await api('GET', `/projects/${projectId}/chapters/${chapterId}`)
      assert(ch.json.chapter.status === 'final', `chapter status is ${ch.json.chapter.status}, expected final`)
    })
  } else {
    log('\nLLM generation pipeline: SKIPPED (SKIP_LLM=1)')
  }

  // ---- Cleanup ----
  log('\nCleanup')
  await test('DELETE /projects/:id removes the project', async () => {
    const r = await api('DELETE', `/projects/${projectId}`)
    assert(r.status === 200, `status ${r.status}`)
    const list = await api('GET', '/projects')
    assert(!list.json.some(p => p.id === projectId), 'project still present after delete')
  })
  await test('DELETE /projects/:id cascades — no orphaned child data remains', async () => {
    // Collections listed directly by projectId: every one must come back empty.
    const collections = [
      ['chapters',       `/projects/${projectId}/chapters`],
      ['characters',     `/projects/${projectId}/characters`],
      ['locations',      `/projects/${projectId}/locations`],
      ['relationships',  `/projects/${projectId}/relationships`],
      ['lore',           `/projects/${projectId}/lore`],
      ['arcs',           `/projects/${projectId}/arcs`],
      ['threads',        `/projects/${projectId}/threads`],
      ['foreshadowing',  `/projects/${projectId}/foreshadowing`],
      ['style-profiles', `/projects/${projectId}/style-profiles`],
      ['kb',             `/projects/${projectId}/kb?q=Highvale`],
    ]
    const orphaned = []
    for (const [name, path] of collections) {
      const r = await api('GET', path)
      if (Array.isArray(r.json) && r.json.length > 0) orphaned.push(`${name}=${r.json.length}`)
    }
    // The ideas list also returns global (null-projectId) ideas, so only flag
    // rows still scoped to the deleted project.
    const ideas = await api('GET', `/projects/${projectId}/ideas`)
    if (Array.isArray(ideas.json) && ideas.json.some(i => i.projectId === projectId)) {
      orphaned.push('ideas')
    }
    assert(orphaned.length === 0, `orphaned rows survived delete: ${orphaned.join(', ')}`)

    // Chapter-scoped data (versions, snapshots, character/location states,
    // generation logs) cascades off chapters — the chapter itself must be gone.
    const ch = await api('GET', `/projects/${projectId}/chapters/${chapterId}`)
    assert(ch.status === 404, `chapter still fetchable after delete (status ${ch.status})`)
  })

  // ---- Summary ----
  log('\n' + '='.repeat(52))
  log(`Results: ${passed} passed, ${failed} failed`)
  if (failed) {
    log('\nFailures:')
    for (const f of failures) log(`  - ${f.name}: ${f.error}`)
    process.exit(1)
  }
  log('All tests passed ✅')
  process.exit(0)
}

main().catch(e => {
  log(`\nFatal: ${e.stack || e.message}`)
  process.exit(1)
})
