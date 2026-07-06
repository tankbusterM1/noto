import type { Note } from './types'

/*
 * The weave picker's brain — ranking for the `[[` autocomplete. With a big
 * vault a flat title list is useless, so candidates are scored by:
 *
 *   1. fuzzy match against what you typed (word-initials count: "tsa" finds
 *      "Transformer Self-Attention"), and
 *   2. relevance to *where you are*: shared tags and folder with the current
 *      note, notes on your ink trail, notes edited this week.
 *
 * With an empty query (you just typed `[[`), fuzzy is neutral and pure
 * relevance orders the list — Noto guesses the link before you type it.
 * Pure module: no stores, no DOM, unit-tested.
 */

/**
 * Subsequence fuzzy score; -1 = no match. Word-start hits (initials),
 * consecutive runs and near-prefix matches score higher; shorter titles win
 * ties. Empty query matches everything neutrally.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 1
  let qi = 0
  let score = 0
  let prevHit = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      const wordStart = i === 0 || /[\s\-_/.·(]/.test(t[i - 1])
      score += 10
      if (wordStart) score += 15
      if (prevHit === i - 1) score += 8
      if (i === qi) score += 3
      prevHit = i
      qi++
    }
  }
  if (qi < q.length) return -1
  return score + Math.max(0, 20 - Math.floor(t.length / 4))
}

export type WeaveGroup = 'nearby' | 'fresh' | 'archive'

export interface WeaveCandidate {
  note: Note
  score: number
  /** Why this candidate surfaced — shown next to the title. */
  detail: string
  group: WeaveGroup
}

/**
 * Rank link candidates for the current note. `trail` is the recently-visited
 * note ids (most recent last). Returns at most `cap`, best first.
 */
export function rankWeave(
  query: string,
  current: Pick<Note, 'id' | 'tags' | 'folderId'> | null,
  notes: Note[],
  trail: string[] = [],
  cap = 12,
): WeaveCandidate[] {
  const out: WeaveCandidate[] = []
  for (const n of notes) {
    if (current && n.id === current.id) continue
    const fz = fuzzyScore(query, n.title)
    if (fz < 0) continue

    let rel = 0
    let detail = ''
    let group: WeaveGroup = 'archive'

    const shared = current ? n.tags.filter((t) => current.tags.includes(t)) : []
    const sameFolder = !!current && !!current.folderId && n.folderId === current.folderId
    const trailIdx = trail.indexOf(n.id)
    const fresh = n.updated >= -7

    if (shared.length) {
      rel += 24 * shared.length
      detail = '#' + shared[0]
      group = 'nearby'
    } else if (sameFolder) {
      rel += 10
      detail = 'same folder'
      group = 'nearby'
    }
    if (trailIdx >= 0) {
      rel += 8 + trailIdx * 4
      if (group === 'archive') {
        detail = 'on your trail'
        group = 'fresh'
      }
    }
    if (fresh) {
      rel += Math.round(12 * (1 - Math.min(7, -n.updated) / 8))
      if (group === 'archive') {
        detail = n.updated === 0 ? 'edited today' : `edited ${-n.updated}d ago`
        group = 'fresh'
      }
    }

    out.push({ note: n, score: fz * 2 + rel, detail, group })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, cap)
}
