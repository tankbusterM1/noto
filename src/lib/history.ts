import type { Block } from './types'

/*
 * Draft-history policy — pure + testable. A flat interval spams near-identical
 * drafts, so instead we:
 *   1. only save a draft when enough has actually CHANGED since the last one
 *      (typos don't count), and no more often than MIN_GAP; and
 *   2. thin older drafts on a logarithmic curve — keep every draft from the
 *      last hour, ~hourly for a day, ~daily for a week, ~weekly beyond — so the
 *      timeline spans a long history without ballooning in count.
 */

export const MIN_GAP_MS = 5 * 60_000 // ≥ 5 min between drafts
export const MIN_CHANGE = 80 // ≥ ~a sentence of changed characters
export const MAX_DRAFTS = 40 // hard backstop after thinning

const H = 3_600_000
const DAY = 24 * H

function plainText(blocks: Block[]): string {
  return blocks.map((b) => (b.text ?? '') + ' ' + (b.items ?? []).join(' ')).join('\n')
}

/** Cheap change magnitude between two block sets — characters added / removed /
 *  replaced (position-wise). 0 when identical. */
export function changeChars(a: Block[], b: Block[]): number {
  const ta = plainText(a)
  const tb = plainText(b)
  if (ta === tb) return 0
  let diff = Math.abs(ta.length - tb.length)
  const n = Math.min(ta.length, tb.length)
  for (let i = 0; i < n; i++) if (ta[i] !== tb[i]) diff++
  return diff
}

/** Minimum spacing (ms) between kept drafts, growing with age. */
function minSpacing(ageMs: number): number {
  if (ageMs < H) return 0 // last hour → keep everything
  if (ageMs < DAY) return H // last day → ~hourly
  if (ageMs < 7 * DAY) return DAY // last week → ~daily
  return 7 * DAY // older → ~weekly
}

/**
 * Given the about-to-be-overwritten state and the newest stored draft, decide
 * whether it's worth a new draft. First draft always counts; after that it must
 * be MIN_GAP old AND differ by ≥ MIN_CHANGE.
 */
export function shouldSnapshot(
  prev: Block[],
  newest: { savedAt: number; blocks: Block[] } | null,
  now: number,
): boolean {
  if (!newest) return true
  if (now - newest.savedAt < MIN_GAP_MS) return false
  return changeChars(newest.blocks, prev) >= MIN_CHANGE
}

/**
 * Which draft ids to prune so the kept set follows the logarithmic curve above
 * (dense recent, sparse old) under MAX_DRAFTS. The newest is always kept.
 */
export function draftsToPrune(drafts: { id: number; savedAt: number }[], now: number): number[] {
  const sorted = drafts.slice().sort((a, b) => b.savedAt - a.savedAt) // newest first
  const del: number[] = []
  let lastKept = Infinity
  for (const d of sorted) {
    if (lastKept - d.savedAt >= minSpacing(now - d.savedAt)) {
      lastKept = d.savedAt
    } else {
      del.push(d.id)
    }
  }
  const kept = sorted.filter((d) => !del.includes(d.id))
  if (kept.length > MAX_DRAFTS) for (const d of kept.slice(MAX_DRAFTS)) del.push(d.id)
  return del
}
