/*
 * Bytes — bite-sized learning cards. Pure, shared verbatim with iOS (like the
 * rest of src/lib). A card is stored as a SyncRow, so it merges by id / LWW and
 * rides the vault exactly like a todo. Authoring lives on desktop; the phone
 * reads, schedules, and turns a Kept card into a note.
 */
import type { SyncRow } from './sync';

/** Topics we ship starter packs for. Free-form strings are allowed too. */
export const BYTE_TOPICS = ['ml', 'ai', 'sql', 'python', 'stats', 'cs'] as const;
export type ByteTopic = (typeof BYTE_TOPICS)[number];

export interface ByteCard {
  id: string;
  /** epoch ms — LWW like every other row */
  updatedAt: number;
  pack: string;
  topic: string;
  /** 1..3, low → high; the scheduler ramps within a topic */
  level: number;
  title: string;
  blurb: string;
  code?: string;
  lang?: string;
  source?: string;
  /** Optional tiny text diagram (dual coding — a picture beside the words). */
  diagram?: string;
}

/** Fresh card id. */
export function byteId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

/** Read a stored row back into a card, defensively (rows carry unknown fields). */
export function toCard(r: SyncRow): ByteCard | null {
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) return null;
  return {
    id: r.id,
    updatedAt: r.updatedAt,
    pack: typeof r.pack === 'string' ? r.pack : 'foundations',
    topic: typeof r.topic === 'string' ? r.topic : 'cs',
    level: typeof r.level === 'number' && r.level >= 1 ? Math.round(r.level) : 1,
    title,
    blurb: typeof r.blurb === 'string' ? r.blurb : '',
    code: typeof r.code === 'string' && r.code.trim() ? r.code : undefined,
    lang: typeof r.lang === 'string' && r.lang ? r.lang : undefined,
    source: typeof r.source === 'string' && r.source ? r.source : undefined,
    diagram: typeof r.diagram === 'string' && r.diagram.trim() ? r.diagram : undefined,
  };
}

/** A card is already SyncRow-shaped; this just makes the intent explicit. */
export function cardToRow(c: ByteCard): SyncRow {
  return { ...c } as SyncRow;
}

/** The markdown body of the note created when a card is Kept. */
export function cardToMarkdown(c: ByteCard): string {
  let md = c.blurb || c.title;
  if (c.code) md += '\n\n```' + (c.lang ?? '') + '\n' + c.code + '\n```';
  if (c.source) md += '\n\n— ' + c.source;
  return md;
}

/*
 * Batch parser for the deck's paste box. One card per block, blocks split by a
 * line that is just `---`:
 *
 *   ## sql · joins :: LEFT JOIN keeps every left row
 *   Unmatched right side comes back NULL…
 *   ```sql
 *   SELECT …
 *   ```
 *
 * Header: `##  <topic label> :: <title>`. The topic is the first word of the
 * label (so "sql · joins" → topic "sql"). Body is everything up to an optional
 * fenced code block. Blank or header-less blocks are skipped, not errors.
 */
const HEADER_RE = /^#{0,3}\s*(.+?)\s*::\s*(.+?)\s*$/;

function parseBlock(block: string, pack: string, now: number): ByteCard | null {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const header = lines[i]?.match(HEADER_RE);
  if (!header) return null;
  const topic = header[1].trim().split(/[\s·|/]+/)[0].toLowerCase() || 'cs';
  const title = header[2].trim();
  if (!title) return null;
  i++;

  const body: string[] = [];
  let code: string | undefined;
  let lang: string | undefined;
  for (; i < lines.length; i++) {
    const fence = lines[i].match(/^```(\w*)\s*$/);
    if (fence) {
      lang = fence[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      code = codeLines.join('\n').trim() || undefined;
      continue;
    }
    body.push(lines[i]);
  }
  return {
    id: byteId(),
    updatedAt: now,
    pack,
    topic,
    level: 1,
    title,
    blurb: body.join('\n').trim(),
    code,
    lang,
  };
}

export function parseBatch(text: string, pack: string, now: number): ByteCard[] {
  return text
    .split(/^\s*---\s*$/m)
    .map((block) => parseBlock(block, pack, now))
    .filter((c): c is ByteCard => c !== null);
}
