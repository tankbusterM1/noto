/*
 * Checkpoint generation — turns a graduated Byte card into a quick retrieval
 * check, so learning is active recall rather than re-reading. Pure +
 * deterministic (same card → same checkpoint), so it's testable and never
 * flickers between renders.
 *
 * Today it makes CLOZE checks from a card's code: blank the concept keyword and
 * offer plausible distractors from the same family. Cards with no code (or no
 * keyword) return null and simply stay reads — we never invent a junk question.
 */
import type { ByteCard } from './bytes';

export interface Checkpoint {
  cardId: string;
  kind: 'cloze';
  /** The card's code with the target keyword replaced by a blank. */
  prompt: string;
  answer: string;
  /** The answer plus distractors, deterministically shuffled. */
  choices: string[];
}

// Concept-bearing keywords we're willing to blank. Multi-word first so longest
// wins (blank "PARTITION BY", not "BY").
const KEYWORDS = [
  'PARTITION BY', 'ORDER BY', 'GROUP BY', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN',
  'UNION ALL', 'DENSE_RANK', 'ROW_NUMBER', 'FIRST_VALUE', 'LAST_VALUE', 'DATE_TRUNC', 'SPLIT_PART',
  'CONCAT_WS', 'SUBSTRING', 'COALESCE', 'DISTINCT', 'INTERSECT', 'BETWEEN', 'EXTRACT', 'INTERVAL',
  'HAVING', 'SELECT', 'OFFSET', 'CONCAT', 'LENGTH', 'EXCEPT', 'UNION', 'WHERE', 'LIMIT', 'RANK',
  'LEAD', 'JOIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'LOWER', 'UPPER', 'ROUND', 'TRIM', 'SUM', 'AVG',
  'COUNT', 'MIN', 'MAX', 'MOD', 'LAG', 'LIKE', 'IN', 'ON',
];

// Plausible-distractor groups — a wrong answer from the same family teaches more
// than a random one.
const FAMILIES: string[][] = [
  ['ROW_NUMBER', 'RANK', 'DENSE_RANK'],
  ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN', 'JOIN'],
  ['UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT'],
  ['GROUP BY', 'ORDER BY', 'PARTITION BY'],
  ['WHERE', 'HAVING'],
  ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'MOD', 'ROUND'],
  ['LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE'],
  ['COALESCE', 'DISTINCT', 'CASE'],
  ['LOWER', 'UPPER', 'TRIM', 'LENGTH', 'SUBSTRING', 'CONCAT', 'CONCAT_WS', 'SPLIT_PART'],
  ['BETWEEN', 'IN', 'LIKE'],
  ['LIMIT', 'OFFSET'],
  ['EXTRACT', 'DATE_TRUNC', 'INTERVAL'],
];

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word-boundary match so RANK isn't found inside DENSE_RANK. */
const rx = (k: string): RegExp => new RegExp('\\b' + esc(k) + '\\b', 'i');

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic Fisher–Yates from a seed (xorshift), so choices don't reshuffle. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  const rand = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967295;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a cloze checkpoint from a card's code, or null if it has none to blank. */
export function clozeFor(card: ByteCard): Checkpoint | null {
  if (!card.code) return null;
  const present = KEYWORDS.filter((k) => rx(k).test(card.code!));
  if (!present.length) return null;

  // Prefer the keyword that's also in the title (that's what the card teaches);
  // otherwise the longest keyword present.
  const byLen = (a: string, b: string): number => b.length - a.length;
  const inTitle = present.filter((k) => rx(k).test(card.title)).sort(byLen);
  const target = inTitle[0] ?? present.slice().sort(byLen)[0];

  const prompt = card.code!.replace(rx(target), '_____');

  const fam = FAMILIES.find((f) => f.includes(target)) ?? [];
  const chosen = new Set([target]);
  const distractors: string[] = [];
  for (const k of [...fam, ...present, ...KEYWORDS]) {
    if (distractors.length >= 3) break;
    if (chosen.has(k)) continue;
    chosen.add(k);
    distractors.push(k);
  }

  const choices = shuffle([target, ...distractors], hash32(card.id));
  return { cardId: card.id, kind: 'cloze', prompt, answer: target, choices };
}

/** The checkpoint for a card, or null to keep it a read. */
export function checkpointFor(card: ByteCard): Checkpoint | null {
  return clozeFor(card);
}
