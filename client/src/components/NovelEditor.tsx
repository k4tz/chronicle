// client/src/components/NovelEditor.tsx
//
// CodeMirror 6 prose editor (C1). Chosen over a rich-text editor so chapter
// content stays plain text — keeping export, word-count, autosave-diff, and
// continuity checks unchanged — while gaining a real decoration/tooltip API for
// inline entity hovercards: known character/location names are underlined and
// hovering one shows its type + a short summary.

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, MatchDecorator, Decoration, ViewPlugin, hoverTooltip, type DecorationSet } from '@codemirror/view'

export interface EntityRef {
  name: string
  type: string
  detail?: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMatcher(names: string[]): RegExp | null {
  const cleaned = names.filter(n => n && n.trim().length > 1)
  if (cleaned.length === 0) return null
  // Longest first so multi-word names win over a substring of them.
  const pattern = cleaned.sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  return new RegExp(`\\b(?:${pattern})\\b`, 'gi')
}

// Editor look: transparent background + inherited color so it blends with the
// app's light/dark container; serif, roomy line height for prose.
const proseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit', fontSize: '1.075rem' },
  '.cm-content': { fontFamily: 'Georgia, Cambria, "Times New Roman", serif', lineHeight: '1.75', padding: '1rem 0' },
  '.cm-scroller': { fontFamily: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  '.cm-entity': { textDecoration: 'underline dotted', textUnderlineOffset: '3px', textDecorationColor: '#818cf8', cursor: 'help' },
  '.cm-entity-tooltip': { maxWidth: '280px', padding: '8px 10px', borderRadius: '6px', background: '#111827', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', fontSize: '12px', lineHeight: '1.4', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
  '.cm-et-type': { textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px', color: '#a5b4fc' },
  '.cm-et-name': { fontWeight: 600, marginTop: '1px' },
  '.cm-et-detail': { marginTop: '3px', color: '#d1d5db' },
})

function entityExtensions(entities: EntityRef[]) {
  const names = entities.map(e => e.name)
  const matcher = buildMatcher(names)
  if (!matcher) return []

  const byLower = new Map(entities.map(e => [e.name.toLowerCase(), e]))

  // Underline entity-name occurrences across the viewport.
  const deco = new MatchDecorator({
    regexp: matcher,
    decoration: () => Decoration.mark({ class: 'cm-entity' }),
  })
  const highlightPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) { this.decorations = deco.createDeco(view) }
      update(u: any) { if (u.docChanged || u.viewportChanged) this.decorations = deco.updateDeco(u, this.decorations) }
    },
    { decorations: (v) => v.decorations },
  )

  // Hovercard: if the hovered position falls inside an entity name, show its card.
  const hover = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const re = new RegExp(matcher.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(line.text))) {
      const start = line.from + m.index
      const end = start + m[0].length
      if (pos >= start && pos <= end) {
        const ent = byLower.get(m[0].toLowerCase())
        if (!ent) continue
        return {
          pos: start,
          end,
          above: true,
          create() {
            const dom = document.createElement('div')
            dom.className = 'cm-entity-tooltip'
            const type = document.createElement('div'); type.className = 'cm-et-type'; type.textContent = ent.type
            const name = document.createElement('div'); name.className = 'cm-et-name'; name.textContent = ent.name
            dom.appendChild(type); dom.appendChild(name)
            if (ent.detail) { const d = document.createElement('div'); d.className = 'cm-et-detail'; d.textContent = ent.detail; dom.appendChild(d) }
            return { dom }
          },
        }
      }
    }
    return null
  })

  return [highlightPlugin, hover]
}

interface NovelEditorProps {
  value: string
  onChange: (value: string) => void
  entities: EntityRef[]
  autoFocus?: boolean
  height?: string
  placeholder?: string
}

export default function NovelEditor({ value, onChange, entities, autoFocus, height = '600px', placeholder }: NovelEditorProps) {
  // Rebuild entity extensions only when the set of names/details changes.
  const entityExts = useMemo(
    () => entityExtensions(entities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entities.map(e => `${e.name}|${e.detail || ''}`).join('')],
  )
  const extensions = useMemo(() => [EditorView.lineWrapping, proseTheme, ...entityExts], [entityExts])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      autoFocus={autoFocus}
      height={height}
      placeholder={placeholder}
      // 'none' so the wrapper doesn't force a white background; our proseTheme
      // keeps it transparent and inherits the app's light/dark text color.
      theme="none"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        searchKeymap: false,
        indentOnInput: false,
      }}
    />
  )
}
