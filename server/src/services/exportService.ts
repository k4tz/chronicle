// server/src/services/exportService.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { db, eq } from '../db'
import { projects, chapters, chapterVersions, characters as charactersSchema, locations as locationsSchema, loreEntries, storyArcs, plotThreads, worldFoundations } from '../db/schema'
// Export should publish the FINAL prose (falling back to draft), not whatever
// stage was written most recently.
import { pickBestVersion } from './versionService'

export interface ExportOptions {
  includeFrontMatter: boolean
  includeOutline: boolean
  chapterHeaderStyle: 'heading' | 'centered' | 'plain'
  fontFamily: string
  lineSpacing: number
}

export class ExportService {
  async exportNovelToDocx(projectId: string, options: ExportOptions = {
    includeFrontMatter: true,
    includeOutline: false,
    chapterHeaderStyle: 'heading',
    fontFamily: 'Times New Roman',
    lineSpacing: 1.5,
  }): Promise<Buffer> {
    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) throw new Error('Project not found')

    // Get all chapters
    const allChapters = await db.select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.number)
      .all()

    const children: any[] = []

    // Front matter
    if (options.includeFrontMatter) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: project.title, bold: true, size: 48 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: project.logline || '', italics: true, size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Genre: ${project.genre || 'N/A'}`, size: 20 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Tone: ${project.tone || 'N/A'}`, size: 20 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Word Count: ${project.currentWordCount.toLocaleString()}`, size: 20 })],
          spacing: { after: 800 },
        }),
      )

      // Page break
      children.push(new Paragraph({
        pageBreakBefore: true,
      }))
    }

    // Chapters
    for (const chapter of allChapters) {
      // Get latest version
      const versions = await db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, chapter.id))
        .orderBy(chapterVersions.createdAt)
        .all()

      const latestVersion = pickBestVersion(versions)
      if (!latestVersion) continue

      // Chapter title
      const titleStyle = options.chapterHeaderStyle === 'heading' ? HeadingLevel.HEADING_1 :
        options.chapterHeaderStyle === 'centered' ? HeadingLevel.HEADING_1 : undefined

      children.push(
        new Paragraph({
          children: [new TextRun({
            text: chapter.title || `Chapter ${chapter.number}`,
            bold: true,
            size: 32,
          })],
          heading: titleStyle,
          alignment: options.chapterHeaderStyle === 'centered' ? AlignmentType.CENTER : undefined,
          pageBreakBefore: children.length > 0,
          spacing: { after: 400 },
        })
      )

      // Outline (if requested)
      if (options.includeOutline && chapter.outline) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Outline', italics: true, size: 20 })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: chapter.outline, size: 20 })],
            spacing: { after: 400 },
          })
        )
      }

      // Chapter content
      const contentParagraphs = latestVersion.content.split('\n\n')
      for (const para of contentParagraphs) {
        if (para.trim()) {
          children.push(
            new Paragraph({
              children: [new TextRun({
                text: para,
                size: 24,
                font: options.fontFamily,
              })],
              spacing: { line: options.lineSpacing * 240 },
            })
          )
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    })

    return Packer.toBuffer(doc)
  }

  async exportStoryBible(projectId: string): Promise<Buffer> {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) throw new Error('Project not found')

    const children: any[] = []

    // Title
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${project.title} - Story Bible`, bold: true, size: 48 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({ pageBreakBefore: true })
    )

    // World Foundation
    const world = await db.select().from(worldFoundations).where(eq(worldFoundations.projectId, projectId)).get()
    if (world) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'World Foundation', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
        })
      )
      const sections = [
        { title: 'Cosmology', content: world.cosmology },
        { title: 'History', content: world.history },
        { title: 'Geography', content: world.geography },
        { title: 'Political Landscape', content: world.politicalLandscape },
        { title: 'Economy', content: world.economy },
        { title: 'Culture', content: world.culture },
        { title: 'Magic/Tech Rules', content: world.magicOrTechRules },
      ]
      for (const section of sections) {
        if (section.content) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: section.title, bold: true, size: 24 })],
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [new TextRun({ text: section.content, size: 22 })],
              spacing: { after: 200 },
            })
          )
        }
      }
      children.push(new Paragraph({ pageBreakBefore: true }))
    }

    // Characters
    const allCharacters = await db.select().from(charactersSchema).where(eq(charactersSchema.projectId, projectId)).all()
    if (allCharacters.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Characters', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
        })
      )
      for (const char of allCharacters) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: char.name, bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [new TextRun({ text: `Background: ${char.background || 'N/A'}`, size: 20 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Personality: ${char.personality || 'N/A'}`, size: 20 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Motivation: ${char.motivation || 'N/A'}`, size: 20 })],
            spacing: { after: 200 },
          })
        )
      }
      children.push(new Paragraph({ pageBreakBefore: true }))
    }

    // Locations
    const allLocations = await db.select().from(locationsSchema).where(eq(locationsSchema.projectId, projectId)).all()
    if (allLocations.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Locations', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
        })
      )
      for (const loc of allLocations) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: loc.name, bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [new TextRun({ text: loc.description || 'N/A', size: 20 })],
            spacing: { after: 200 },
          })
        )
      }
      children.push(new Paragraph({ pageBreakBefore: true }))
    }

    // Lore
    const loreEntriesList = await db.select().from(loreEntries).where(eq(loreEntries.projectId, projectId)).all()
    if (loreEntriesList.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Lore Entries', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
        })
      )
      for (const entry of loreEntriesList) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: entry.title, bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [new TextRun({ text: `[${entry.category}] ${entry.content}`, size: 20 })],
            spacing: { after: 200 },
          })
        )
      }
    }

    const doc = new Document({ sections: [{ properties: {}, children }] })
    return Packer.toBuffer(doc)
  }

  async exportToTxt(projectId: string): Promise<string> {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) throw new Error('Project not found')

    const allChapters = await db.select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.number)
      .all()

    let content = `${project.title}\n${'='.repeat(project.title.length)}\n\n`
    if (project.logline) content += `${project.logline}\n\n`

    for (const chapter of allChapters) {
      const versions = await db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, chapter.id))
        .orderBy(chapterVersions.createdAt)
        .all()

      const latestVersion = pickBestVersion(versions)
      if (!latestVersion) continue

      content += `\n\n${chapter.title || `Chapter ${chapter.number}`}\n`
      content += `${'-'.repeat((chapter.title || `Chapter ${chapter.number}`).length)}\n\n`
      content += latestVersion.content
    }

    return content
  }
}

export const exportService = new ExportService()
