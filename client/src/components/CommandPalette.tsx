// client/src/components/CommandPalette.tsx
import { useEffect, useMemo, useRef, useState } from 'react'

export interface Command {
  label: string
  hint?: string
  action: () => void
}

/**
 * Global ⌘/Ctrl+K palette for jumping between projects/tools (C3). Filter as you
 * type, arrow keys to move, Enter to run, Esc to close.
 */
export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim()
    return s ? commands.filter((c) => c.label.toLowerCase().includes(s)) : commands
  }, [q, commands])

  if (!open) return null

  const run = (i: number) => {
    const cmd = filtered[i]
    if (cmd) { cmd.action(); setOpen(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); run(active) }
          }}
          placeholder="Jump to… (type to filter)"
          className="w-full px-4 py-3 border-b dark:border-gray-700 bg-transparent outline-none text-gray-900 dark:text-gray-100"
        />
        <ul className="max-h-80 overflow-y-auto">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No matches</li>}
          {filtered.map((c, i) => (
            <li key={`${c.label}-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
                className={`w-full text-left px-4 py-2.5 flex justify-between items-center ${i === active ? 'bg-blue-50 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <span className="text-gray-900 dark:text-gray-100">{c.label}</span>
                {c.hint && <span className="text-xs text-gray-400">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 text-[11px] text-gray-400 border-t dark:border-gray-700">⌘/Ctrl+K toggle · ↑↓ move · ↵ open · Esc close</div>
      </div>
    </div>
  )
}
