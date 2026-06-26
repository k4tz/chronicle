// server/src/services/retrieval.ts
//
// Relevance-ranked retrieval for context assembly. Replaces the old "dump every
// entity that was passed by ID" approach (which produced *empty* context when a
// caller passed no IDs) with an actual relevance scorer: given a query (the
// chapter outline/focus + recent canon), rank candidate entities and select the
// most relevant top-k within budget.
//
// Default backend is local HuggingFace embeddings (transformers.js, BGE-small)
// for semantic relevance. It falls back to a dependency-free lexical scorer
// (TF-IDF cosine) when embeddings are disabled or unavailable, so retrieval
// always returns a sensible ranking even offline / before the model downloads.

import { embed as hfEmbed } from './embeddingService'

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one',
  'our', 'out', 'his', 'has', 'him', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'they', 'this', 'have',
  'from', 'were', 'their', 'them', 'then', 'than', 'into', 'over', 'such', 'been', 'will', 'would',
  'there', 'which', 'when', 'what', 'your', 'about', 'could', 'these', 'those', 'where',
])

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
  return matches.filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
  return tf
}

function dot(a: Map<string, number>, b: Map<string, number>): number {
  let sum = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const [k, v] of small) {
    const w = large.get(k)
    if (w) sum += v * w
  }
  return sum
}

function norm(v: Map<string, number>): number {
  let s = 0
  for (const x of v.values()) s += x * x
  return Math.sqrt(s)
}

export interface Candidate<T> {
  item: T
  text: string
}

export interface Scored<T> {
  item: T
  score: number
}

/**
 * TF-IDF cosine similarity of each candidate's text against the query.
 * IDF is computed over the candidate set itself (a small, self-contained
 * corpus), which is enough to down-weight ubiquitous terms.
 */
export function rankByLexical<T>(query: string, candidates: Candidate<T>[]): Scored<T>[] {
  const qTokens = tokenize(query)
  if (candidates.length === 0) return []
  if (qTokens.length === 0) return candidates.map((c) => ({ item: c.item, score: 0 }))

  const docTokens = candidates.map((c) => tokenize(c.text))
  const df = new Map<string, number>()
  for (const toks of docTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1)
  }
  const N = candidates.length
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) || 0)))

  const qvec = new Map<string, number>()
  for (const [t, f] of termFreq(qTokens)) qvec.set(t, f * idf(t))
  const qn = norm(qvec)

  return candidates
    .map((c, i) => {
      const dvec = new Map<string, number>()
      for (const [t, f] of termFreq(docTokens[i])) dvec.set(t, f * idf(t))
      const dn = norm(dvec)
      const score = qn === 0 || dn === 0 ? 0 : dot(qvec, dvec) / (qn * dn)
      return { item: c.item, score }
    })
    .sort((a, b) => b.score - a.score)
}

function cosineVec(a: number[], b: number[]): number {
  let dotp = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dotp += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dotp / (Math.sqrt(na) * Math.sqrt(nb))
}

// Embedding-backed ranking via local HuggingFace embeddings. The query gets the
// BGE query instruction; documents are embedded plain. Both pass through the
// persistent vector cache, so only the (new) query is embedded each generation.
export async function rankByEmbedding<T>(query: string, candidates: Candidate<T>[]): Promise<Scored<T>[]> {
  if (candidates.length === 0) return []
  const [q] = await hfEmbed([query], { query: true })
  const docVectors = await hfEmbed(candidates.map((c) => c.text))
  return candidates
    .map((c, i) => ({ item: c.item, score: cosineVec(q, docVectors[i]) }))
    .sort((a, b) => b.score - a.score)
}

// Enabled by default now that embeddings run locally with no token/network at
// inference. Set EMBEDDINGS_ENABLED=0 (or false) to force the lexical scorer.
export function embeddingsEnabled(): boolean {
  const v = process.env.EMBEDDINGS_ENABLED
  return v !== '0' && v !== 'false'
}

/**
 * Rank candidates by relevance to the query. Uses embeddings when enabled and
 * reachable; otherwise (and on any embedding error) falls back to the lexical
 * scorer so retrieval always returns a sensible ranking.
 */
export async function rankByRelevance<T>(query: string, candidates: Candidate<T>[]): Promise<Scored<T>[]> {
  if (embeddingsEnabled()) {
    try {
      return await rankByEmbedding(query, candidates)
    } catch (err) {
      console.warn('Embedding ranking failed, falling back to lexical:', (err as Error).message)
    }
  }
  return rankByLexical(query, candidates)
}
