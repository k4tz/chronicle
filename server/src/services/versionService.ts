// server/src/services/versionService.ts
//
// Chapter-version stage helpers. A chapter keeps exactly ONE version row per
// canonical stage (OUTLINE / DRAFT / FINAL); these helpers enforce that and
// pick the right stage to treat as "the prose". Kept in a service (not a route)
// so both routes and exportService can use them without a layering inversion.

import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { chapters, chapterVersions, projects } from '../db/schema'

// The three canonical stages a chapter moves through. We keep exactly ONE
// version row per stage per chapter (newest content wins) instead of appending
// a new row on every checkpoint/autosave — that proliferation (and tiny
// mid-stream "1-word" rows) was the "version system is broken" bug.
export const STAGES = ['OUTLINE', 'DRAFT', 'FINAL'] as const
export type Stage = (typeof STAGES)[number]

// Map any (incl. legacy) pass type onto a canonical stage.
export function canonicalStage(passType: string): Stage {
  if (passType === 'OUTLINE') return 'OUTLINE'
  if (passType === 'FINAL' || passType === 'STYLE') return 'FINAL'
  return 'DRAFT' // DRAFT, MANUAL, anything else
}

export function countWords(content: string): number {
  return content.split(/\s+/).filter(w => w.length > 0).length
}

type VersionRow = typeof chapterVersions.$inferSelect

/**
 * The chapter's current prose version: Final, else Draft, else Outline (newest
 * within the chosen stage). Use this instead of "newest version by createdAt" —
 * that became unreliable once versions upsert in place (regenerating the outline
 * would otherwise become the newest row and get exported/finalized as prose).
 */
export function pickBestVersion(versions: VersionRow[]): VersionRow | null {
  const newest = (s: Stage) =>
    versions.filter(v => canonicalStage(v.passType) === s).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop() || null
  return newest('FINAL') || newest('DRAFT') || newest('OUTLINE')
}

/**
 * Upsert THE single version row for a chapter's stage and self-heal: any extra
 * rows that map to the same stage (legacy STYLE/MANUAL/duplicate checkpoints —
 * the "1-word draft" spam) are collapsed into one. Returns the surviving id.
 */
export async function upsertStageVersion(chapterId: string, content: string, passType: string): Promise<string> {
  const stage = canonicalStage(passType)
  const wordCount = countWords(content)
  const now = new Date().toISOString()

  const sameStage = (await db.select().from(chapterVersions).where(eq(chapterVersions.chapterId, chapterId)).all())
    .filter(v => canonicalStage(v.passType) === stage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  if (sameStage.length > 0) {
    const keep = sameStage[sameStage.length - 1]
    await db.update(chapterVersions).set({ content, passType: stage, wordCount, createdAt: now }).where(eq(chapterVersions.id, keep.id))
    for (const extra of sameStage.slice(0, -1)) {
      await db.delete(chapterVersions).where(eq(chapterVersions.id, extra.id))
    }
    return keep.id
  }

  const id = nanoid()
  await db.insert(chapterVersions).values({ id, chapterId, content, passType: stage, wordCount, createdAt: now })
  return id
}

// Recompute and persist the project's total word count from its chapters.
export async function recalcProjectWords(projectId: string): Promise<void> {
  const all = await db.select({ wordCount: chapters.wordCount }).from(chapters).where(eq(chapters.projectId, projectId)).all()
  const total = all.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
  await db.update(projects).set({ currentWordCount: total, updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId))
}
