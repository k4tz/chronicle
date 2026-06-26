// server/src/services/cacheService.ts
import { CacheService } from '../types/services'

export class LruCacheService implements CacheService {
  private cache: Map<string, { value: any; expires: number }> = new Map()

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key)
    if (!item) return null

    if (item.expires < Date.now()) {
      this.cache.delete(key)
      return null
    }

    return item.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || 3600 // default 1 hour
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl * 1000),
    })
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async flush(): Promise<void> {
    this.cache.clear()
  }
}

// Shared singleton, used by the context engine to cache LLM-summarized
// compression (keyed by content hash) so we don't re-summarize identical
// passages on every generation pass.
export const cacheService = new LruCacheService()
