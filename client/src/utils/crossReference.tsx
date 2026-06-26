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

function isBoundary(ch: string | undefined): boolean {
  // Treat start/end of string and any non-alphanumeric char as a word boundary.
  return ch === undefined || !/[a-z0-9]/i.test(ch)
}

/** Whole-word, case-insensitive occurrences of `termLower` within `textLower`. */
function findOccurrences(textLower: string, termLower: string): number[] {
  const out: number[] = []
  if (termLower.length < 2) return out // skip 1-char names to avoid noise
  let start = 0
  while (true) {
    const idx = textLower.indexOf(termLower, start)
    if (idx === -1) break
    if (isBoundary(textLower[idx - 1]) && isBoundary(textLower[idx + termLower.length])) {
      out.push(idx)
    }
    start = idx + termLower.length
  }
  return out
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

  const addMatches = (term: string, id: string, type: LinkedEntity['type']) => {
    const trimmed = term.trim()
    if (!trimmed) return
    for (const idx of findOccurrences(textLower, trimmed.toLowerCase())) {
      links.push({ id, name: trimmed, type, start: idx, end: idx + trimmed.length })
    }
  }

  // Characters (names + aliases)
  characters.forEach(char => {
    addMatches(char.name, char.id, 'character')
    if (char.aliases) {
      char.aliases.split(',').forEach(alias => addMatches(alias, char.id, 'character'))
    }
  })

  // Locations
  locations.forEach(loc => addMatches(loc.name, loc.id, 'location'))

  // Lore entry titles
  lore.forEach(entry => addMatches(entry.title, entry.id, 'lore'))

  // Sort by position; on ties prefer the longer match
  links.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))

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
          link.type === 'character' ? 'bg-green-100 text-green-800' :
          link.type === 'location' ? 'bg-blue-100 text-blue-800' :
          'bg-purple-100 text-purple-800'
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
