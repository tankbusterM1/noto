/*
 * A Byte card's optional depth `detail` is free text; this splits it into the
 * swipeable slides the reader pages through. Pure + shared, so desktop preview
 * and the iOS reader agree. The rule the author writes to:
 *
 *   · every ALL-CAPS line starts a NEW slide and becomes its kicker,
 *   · a ```fenced``` block is a code block,
 *   · everything else is body text (blank-line-separated paragraphs stay together).
 *
 * Write n sections, get n slides — each as long as it needs to be.
 */

export interface StoryBlock {
  kind: 'text' | 'code';
  content: string;
  lang?: string;
}

export interface StorySlide {
  /** The ALL-CAPS heading, or '' for an untitled lead slide. */
  kicker: string;
  blocks: StoryBlock[];
}

/** A short, all-caps line (letters only ever uppercase) — a slide heading. */
function isKicker(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 44) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

export function parseStory(detail: string): StorySlide[] {
  const lines = detail.replace(/\r\n/g, '\n').split('\n');
  const slides: StorySlide[] = [];
  let cur: StorySlide | null = null;
  let buf: string[] = [];

  const ensure = (): StorySlide => {
    if (!cur) {
      cur = { kicker: '', blocks: [] };
      slides.push(cur);
    }
    return cur;
  };
  const flush = () => {
    const t = buf.join('\n').trim();
    buf = [];
    if (t) ensure().blocks.push({ kind: 'text', content: t });
  };

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const lang = fence[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) codeLines.push(lines[i++]);
      ensure().blocks.push({ kind: 'code', content: codeLines.join('\n'), lang });
      continue;
    }
    if (isKicker(lines[i])) {
      flush();
      cur = { kicker: lines[i].trim(), blocks: [] };
      slides.push(cur);
      continue;
    }
    buf.push(lines[i]);
  }
  flush();

  return slides.filter((s) => s.kicker || s.blocks.length);
}

/** Does this card carry a depth story worth a slide deck? */
export function hasStory(card: { detail?: string }): boolean {
  return !!card.detail && card.detail.trim().length > 0;
}

/** How many slides the story splits into (0 = none) — for the "◀ the story · N" tag. */
export function storyCount(card: { detail?: string }): number {
  return card.detail ? parseStory(card.detail).length : 0;
}
