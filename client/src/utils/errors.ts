// client/src/utils/errors.ts

// Pull the most useful message out of an axios error: the server's `details`
// (e.g. the LLM failure reason), then its `error`, then a caller-supplied fallback.
export function errorDetail(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { details?: string; error?: string } } }
  return e?.response?.data?.details || e?.response?.data?.error || fallback
}
