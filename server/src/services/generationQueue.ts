// server/src/services/generationQueue.ts
//
// In-process sequential job queue for multi-chapter generation runs
// (REBUILD-PLAN §D1). Jobs are processed one at a time in the background so a
// "generate chapters 5–12" request returns immediately and the client polls
// status. Sequential (not parallel) on purpose: a single local llama.cpp can
// only do one generation at a time, and chapters should build on each other's
// snapshots in order.
//
// Note: this is an in-memory queue — jobs do not survive a server restart. That
// is acceptable for a local single-user app; persisting the queue is future work.

import { nanoid } from 'nanoid'

export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export interface QueueJob {
  id: string
  projectId: string
  chapterId: string
  label: string
  options: Record<string, any>
  status: JobStatus
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

type Processor = (job: QueueJob) => Promise<void>

class GenerationQueue {
  private jobs: QueueJob[] = []
  private processing = false
  private processor: Processor | null = null

  /** Register the function that actually generates a chapter (set once at startup). */
  setProcessor(p: Processor): void {
    this.processor = p
  }

  enqueue(projectId: string, chapterId: string, label: string, options: Record<string, any> = {}): QueueJob {
    const job: QueueJob = {
      id: nanoid(),
      projectId,
      chapterId,
      label,
      options,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    this.jobs.push(job)
    void this.drain()
    return job
  }

  list(projectId?: string): QueueJob[] {
    const jobs = projectId ? this.jobs.filter(j => j.projectId === projectId) : this.jobs
    // newest first
    return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  summary(projectId?: string) {
    const jobs = projectId ? this.jobs.filter(j => j.projectId === projectId) : this.jobs
    const by = (s: JobStatus) => jobs.filter(j => j.status === s).length
    return { total: jobs.length, queued: by('queued'), running: by('running'), done: by('done'), error: by('error') }
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    if (!this.processor) {
      console.warn('Generation queue has no processor registered; jobs will stay queued.')
      return
    }
    this.processing = true
    try {
      // Process queued jobs one at a time until none remain.
      for (;;) {
        const job = this.jobs.find(j => j.status === 'queued')
        if (!job) break
        job.status = 'running'
        job.startedAt = new Date().toISOString()
        try {
          await this.processor(job)
          job.status = 'done'
        } catch (err) {
          job.status = 'error'
          job.error = err instanceof Error ? err.message : String(err)
          console.error(`Generation job ${job.id} (${job.label}) failed:`, job.error)
        }
        job.finishedAt = new Date().toISOString()
      }
    } finally {
      this.processing = false
    }
  }
}

export const generationQueue = new GenerationQueue()
