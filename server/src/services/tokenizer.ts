// server/src/services/tokenizer.ts
//
// Real token counting for context budgeting. Previously the engine estimated
// tokens as chars/4, which drifts badly on dialogue, names, and punctuation and
// could blow the context window or waste budget. gpt-tokenizer is a pure-JS BPE
// tokenizer (o200k_base / GPT-4o). It is not byte-identical to a given llama
// model's tokenizer, but it is far closer than chars/4 and needs no native deps
// or a running model — so budgeting works offline and deterministically.

import { encode, decode } from 'gpt-tokenizer'

/** Number of tokens in a string (0 for empty). Falls back to chars/4 on error. */
export function countTokens(text: string): number {
  if (!text) return 0
  try {
    return encode(text).length
  } catch {
    return Math.ceil(text.length / 4)
  }
}

/** Hard-truncate text to at most maxTokens tokens (may cut mid-sentence). */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ''
  let tokens: number[]
  try {
    tokens = encode(text)
  } catch {
    return text.slice(0, maxTokens * 4)
  }
  if (tokens.length <= maxTokens) return text
  return decode(tokens.slice(0, maxTokens))
}

/**
 * Truncate to a token budget but back off to the last sentence/paragraph
 * boundary so we never cut canon mid-sentence. Used as the graceful fallback
 * when LLM summarization is unavailable.
 */
export function truncateToSentence(text: string, maxTokens: number, marker = '\n\n[…trimmed to fit context budget…]'): string {
  const hard = truncateToTokens(text, maxTokens)
  if (hard === text) return text
  // Prefer a paragraph break, then sentence-ending punctuation.
  const lastPara = hard.lastIndexOf('\n\n')
  const lastSentence = Math.max(hard.lastIndexOf('. '), hard.lastIndexOf('! '), hard.lastIndexOf('? '), hard.lastIndexOf('.\n'))
  const cut = lastPara > hard.length * 0.5 ? lastPara
    : lastSentence > hard.length * 0.5 ? lastSentence + 1
    : hard.length
  return hard.slice(0, cut).trimEnd() + marker
}
