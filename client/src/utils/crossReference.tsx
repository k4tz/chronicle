// client/src/utils/crossReference.ts
import { Character, Location, LoreEntry } from '../api/api'

export interface LinkedEntity {
  id: string
  name: string
  type: 'character' | 'location' | 'lore'
  start: number
  end: number
}

export interface TextWithLinks {
  text: string
  links: LinkedEntity[]
}

/**
 * Finds all entity mentions in text and returns their positions
 */
export function findEntityLinks(
  text: string,
  characters: Character[],
  locations: Location[],
  lore: LoreEntry[]
): LinkedEntity[] {
  const links: LinkedEntity[] = []
  const textLower = text.toLowerCase()

  // Find character names
  characters.forEach(char => {
    const nameLower = char.name.toLowerCase()
    let start = 0
    while (true) {
      const idx = textLower.indexOf(nameLower, start)
      if (idx === -1) break
      links.push({
        id: char.id,
        name: char.name,
        type: 'character',
        start: idx,
        end: idx + char.name.length,
      })
      start = idx + char.name.length
    }
    // Also check aliases
    if (char.aliases) {
      const aliases = char.aliases.split(',').map(a => a.trim())
      aliases.forEach(alias => {
        const aliasLower = alias.toLowerCase()
        let start = 0
        while (true) {
          const idx = textLower.indexOf(aliasLower, start)
          if (idx === -1) break
          links.push({
            id: char.id,
            name: alias,
            type: 'character',
            start: idx,
            end: idx + alias.length,
          })
          start = idx + alias.length
        }
      })
    }
  })

  // Find location names
  locations.forEach(loc => {
    const nameLower = loc.name.toLowerCase()
    let start = 0
    while (true) {
      const idx = textLower.indexOf(nameLower, start)
      if (idx === -1) break
      links.push({
        id: loc.id,
        name: loc.name,
        type: 'location',
        start: idx,
        end: idx + loc.name.length,
      })
      start = idx + loc.name.length
    }
  })

  // Find lore entry titles
  lore.forEach(entry => {
    const titleLower = entry.title.toLowerCase()
    let start = 0
    while (true) {
      const idx = textLower.indexOf(titleLower, start)
      if (idx === -1) break
      links.push({
        id: entry.id,
        name: entry.title,
        type: 'lore',
        start: idx,
        end: idx + entry.title.length,
      })
      start = idx + titleLower.length
    }
  })

  // Sort by position and remove overlaps (prefer longer matches)
  links.sort((a, b) => a.start - b.start || b.end - a.end - a.start + b.start)
  
  const filtered: LinkedEntity[] = []
  let lastEnd = -1
  for (const link of links) {
    if (link.start >= lastEnd) {
      filtered.push(link)
      lastEnd = link.end
    }
  }

  return filtered
}

/**
 * Renders text with clickable entity links
 */
export function renderTextWithLinks(
  text: string,
  links: LinkedEntity[],
  onEntityClick?: (entity: LinkedEntity) => void
): (string | JSX.Element)[] {
  if (links.length === 0) return [text]

  const result: (string | JSX.Element)[] = []
  let lastIndex = 0

  links.forEach((link, i) => {
    // Add text before the link
    if (link.start > lastIndex) {
      result.push(text.slice(lastIndex, link.start))
    }

    // Add the link
    result.push(
      <span
        key={i}
        className={`inline-block px-1 rounded cursor-pointer hover:underline ${
          link.type === 'character' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
          link.type === 'location' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
          'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
        }`}
        onClick={() => onEntityClick?.(link)}
        title={`${link.type}: ${link.name}`}
      >
        {text.slice(link.start, link.end)}
      </span>
    )

    lastIndex = link.end
  })

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }

  return result
}
