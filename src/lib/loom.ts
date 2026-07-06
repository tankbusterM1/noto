import type { Note, SrsState } from './types'

/*
 * The Loom — Noto's knowledge web. Every note is a knot; every shared tag a
 * colored thread; every [[wikilink]] a drawn stroke. Pure helpers here (graph
 * building, thread colors, link resolution); the physics lives in the screen.
 */

/** Matches [[Note Title]] anywhere in text. */
export const WIKI_RE = /\[\[([^[\]]+)\]\]/g

/** Stable signature hue for a tag — the same thread color everywhere. */
export function tagHue(tag: string): number {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360
  return h
}

/** Thread color for a tag (tuned to read on both themes). */
export function threadColor(tag: string, alpha = 1): string {
  return `hsla(${tagHue(tag)}, 42%, 48%, ${alpha})`
}

/** Every [[wikilink]] title mentioned in a note's body. */
export function wikiTitles(note: Note): string[] {
  const out: string[] = []
  for (const b of note.blocks) {
    const texts = [b.text ?? '', ...(b.items ?? [])]
    for (const t of texts) {
      WIKI_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WIKI_RE.exec(t))) out.push(m[1].trim())
    }
  }
  return out
}

/** Resolve a note's outbound [[links]] to note ids (case-insensitive title match). */
export function outboundIds(note: Note, notes: Note[]): string[] {
  const byTitle = new Map(notes.map((n) => [n.title.trim().toLowerCase(), n.id]))
  const ids = new Set<string>()
  for (const t of wikiTitles(note)) {
    const id = byTitle.get(t.toLowerCase())
    if (id && id !== note.id) ids.add(id)
  }
  return [...ids]
}

// ── Full-graph model (the Loom screen) ────────────────────────────────

export interface LoomNode {
  key: string
  kind: 'note' | 'tag'
  /** note id, or the tag name for tag knots. */
  ref: string
  label: string
  /** Knot radius (notes grow with review history). */
  r: number
}

export interface LoomEdge {
  a: number // node index
  b: number
  kind: 'link' | 'tag'
  /** Tag edges carry their thread's tag for coloring. */
  tag?: string
}

export interface Loom {
  nodes: LoomNode[]
  edges: LoomEdge[]
  /** Notes with no threads and no links — waiting to be woven in. */
  loose: Note[]
}

/**
 * Weave the graph: note knots + tag knots (tags shared by ≥2 notes), tag
 * threads note↔tag, and link strokes note↔note from [[wikilinks]].
 */
export function buildLoom(notes: Note[], srs: Record<string, SrsState>): Loom {
  const nodes: LoomNode[] = []
  const edges: LoomEdge[] = []
  const idx = new Map<string, number>()

  for (const n of notes) {
    idx.set('n:' + n.id, nodes.length)
    nodes.push({
      key: 'n:' + n.id,
      kind: 'note',
      ref: n.id,
      label: n.title,
      r: 5 + Math.min(5, (srs[n.id]?.hist.length ?? 0) * 0.8),
    })
  }

  // Shared threads only — a tag one single note uses isn't a connection yet.
  const tagCount = new Map<string, number>()
  for (const n of notes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  for (const [t, c] of tagCount) {
    if (c < 2) continue
    idx.set('t:' + t, nodes.length)
    nodes.push({ key: 't:' + t, kind: 'tag', ref: t, label: '#' + t, r: 4 })
  }

  const seen = new Set<string>()
  for (const n of notes) {
    const a = idx.get('n:' + n.id)!
    for (const t of n.tags) {
      const b = idx.get('t:' + t)
      if (b !== undefined) edges.push({ a, b, kind: 'tag', tag: t })
    }
    for (const target of outboundIds(n, notes)) {
      const b = idx.get('n:' + target)!
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a, b, kind: 'link' })
    }
  }

  const connected = new Set<number>()
  for (const e of edges) {
    connected.add(e.a)
    connected.add(e.b)
  }
  const loose = notes.filter((n) => !connected.has(idx.get('n:' + n.id)!))

  return { nodes, edges, loose }
}

// ── Local loom (editor rail): one note + everything it touches ────────

export interface LocalLink {
  note: Note
  /** 'link' if wiki-linked (either direction); else the first shared tag. */
  via: 'link' | string
}

/**
 * Unwoven mentions — other notes whose *title* appears as plain text in this
 * note but isn't [[linked]] yet. The "Noto noticed" suggestions: one click
 * turns the mention into a thread.
 */
export function unwovenMentions(note: Note, notes: Note[]): Note[] {
  const text = note.blocks.map((b) => (b.text ?? '') + ' ' + (b.items ?? []).join(' ')).join(' ')
  const lower = text.toLowerCase()
  return notes.filter((n) => {
    if (n.id === note.id) return false
    const t = n.title.trim().toLowerCase()
    if (t.length < 4) return false
    if (!lower.includes(t)) return false
    return !lower.includes('[[' + t)
  })
}

export function localLoom(note: Note, notes: Note[]): LocalLink[] {
  const out = new Map<string, LocalLink>()
  const outIds = new Set(outboundIds(note, notes))
  for (const n of notes) {
    if (n.id === note.id) continue
    const linked = outIds.has(n.id) || outboundIds(n, notes).includes(note.id)
    if (linked) {
      out.set(n.id, { note: n, via: 'link' })
      continue
    }
    const shared = n.tags.find((t) => note.tags.includes(t))
    if (shared && !out.has(n.id)) out.set(n.id, { note: n, via: shared })
  }
  return [...out.values()].slice(0, 8)
}
