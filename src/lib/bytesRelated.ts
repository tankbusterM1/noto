/*
 * Elaboration links between cards — "this connects to…" and "go deeper".
 * Pure + deterministic. You remember a web of ideas better than a list, so on a
 * read card we surface a concept-adjacent neighbour or two, and the next level
 * up in the same topic. Derived from shared terms, so it needs no hand-authoring.
 */
import type { ByteCard } from './bytes';

export interface Related {
  /** The next level up in the same topic, if one exists. */
  deeper: ByteCard | null;
  /** A couple of concept-adjacent cards (shared vocabulary). */
  connects: ByteCard[];
}

const STOP = new Set([
  'the', 'and', 'not', 'are', 'with', 'for', 'from', 'into', 'its', 'you', 'your', 'vs', 'via', 'that',
  'this', 'every', 'each', 'only', 'but', 'one', 'two', 'all', 'any', 'then', 'than', 'when', 'what',
  'how', 'why', 'row', 'rows', 'value', 'values', 'card', 'use', 'used', 'like', 'get', 'set',
]);

/** Significant terms of a card: title/blurb words (3+ chars, non-stop) + code keywords. */
function terms(card: ByteCard): Set<string> {
  const set = new Set<string>();
  const words = `${card.title} ${card.blurb}`.toLowerCase().match(/[a-z_]{3,}/g) ?? [];
  for (const w of words) if (!STOP.has(w)) set.add(w);
  if (card.code) for (const m of card.code.toUpperCase().matchAll(/\b[A-Z_]{2,}\b/g)) set.add(m[0].toLowerCase());
  return set;
}

const byId = (a: ByteCard, b: ByteCard): number => (a.id < b.id ? -1 : 1);

export function relatedFor(card: ByteCard, pool: ByteCard[]): Related {
  const deeper =
    pool.filter((c) => c.id !== card.id && c.topic === card.topic && c.level === card.level + 1).sort(byId)[0] ?? null;

  const mine = terms(card);
  const connects = pool
    .filter((c) => c.id !== card.id && c.id !== deeper?.id)
    .map((c) => {
      const t = terms(c);
      let overlap = 0;
      for (const w of mine) if (t.has(w)) overlap++;
      return { c, overlap };
    })
    .filter((x) => x.overlap >= 2) // 2+ shared terms → a real link, not a coincidence
    .sort((a, b) => b.overlap - a.overlap || byId(a.c, b.c))
    .slice(0, 2)
    .map((x) => x.c);

  return { deeper, connects };
}
