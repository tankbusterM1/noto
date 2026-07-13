import { describe, it, expect } from 'vitest';
import { parseStory, hasStory, storyCount } from './bytesStory';
import { parseBatch } from './bytes';

const STORY = `WHY IT MATTERS
Per-group stats without collapsing rows.
It is the most-asked window pattern.
THE MODEL
GROUP BY folds. PARTITION BY keeps every row.
EXAMPLE
\`\`\`sql
SELECT name, AVG(x) OVER (PARTITION BY dept)
FROM t;
\`\`\`
REMEMBER
GROUP BY collapses. PARTITION BY annotates.`;

describe('parseStory', () => {
  it('starts a new slide at each ALL-CAPS line', () => {
    const s = parseStory(STORY);
    expect(s.map((x) => x.kicker)).toEqual(['WHY IT MATTERS', 'THE MODEL', 'EXAMPLE', 'REMEMBER']);
  });

  it('keeps multi-line body together in one text block', () => {
    const s = parseStory(STORY);
    expect(s[0].blocks).toHaveLength(1);
    expect(s[0].blocks[0].kind).toBe('text');
    expect(s[0].blocks[0].content).toContain('most-asked window pattern');
  });

  it('captures fenced code as a code block with its lang', () => {
    const s = parseStory(STORY);
    const ex = s.find((x) => x.kicker === 'EXAMPLE')!;
    expect(ex.blocks.some((b) => b.kind === 'code' && b.lang === 'sql' && b.content.includes('PARTITION BY dept'))).toBe(true);
  });

  it('a slide can hold body then code', () => {
    const s = parseStory('DEMO\nlead text\n```py\nx = 1\n```');
    expect(s).toHaveLength(1);
    expect(s[0].blocks.map((b) => b.kind)).toEqual(['text', 'code']);
  });

  it('text before any kicker becomes an untitled lead slide', () => {
    const s = parseStory('a plain opening line\nWHY\nbecause.');
    expect(s[0].kicker).toBe('');
    expect(s[0].blocks[0].content).toBe('a plain opening line');
    expect(s[1].kicker).toBe('WHY');
  });

  it('does not treat a long all-caps sentence as a kicker', () => {
    const long = 'THIS IS A VERY LONG ALL CAPS SENTENCE THAT IS CLEARLY BODY TEXT NOT A HEADING';
    const s = parseStory(long);
    expect(s).toHaveLength(1);
    expect(s[0].kicker).toBe('');
  });

  it('hasStory / storyCount', () => {
    expect(hasStory({ detail: STORY })).toBe(true);
    expect(hasStory({})).toBe(false);
    expect(hasStory({ detail: '   ' })).toBe(false);
    expect(storyCount({ detail: STORY })).toBe(4);
    expect(storyCount({})).toBe(0);
  });

  it('parseBatch captures everything after +++ as the card detail', () => {
    const text = [
      '## sql · window :: PARTITION BY is GROUP BY for windows',
      'It restarts the window per group.',
      '```sql',
      'AVG(x) OVER (PARTITION BY dept)',
      '```',
      '+++',
      'WHY IT MATTERS',
      'Per-group stats without collapsing rows.',
      'REMEMBER',
      'GROUP BY collapses. PARTITION BY annotates.',
    ].join('\n');
    const [card] = parseBatch(text, 'sql-tutorial', 1000);
    expect(card.title).toBe('PARTITION BY is GROUP BY for windows');
    expect(card.blurb).toBe('It restarts the window per group.'); // face body stops at +++
    expect(card.code).toContain('PARTITION BY dept');
    expect(card.detail).toContain('WHY IT MATTERS');
    expect(card.detail).not.toContain('+++');
    expect(parseStory(card.detail!).map((s) => s.kicker)).toEqual(['WHY IT MATTERS', 'REMEMBER']);
  });

  it('a card with no +++ has no detail', () => {
    const [card] = parseBatch('## sql · x :: Just a face\nplain blurb', 'p', 1);
    expect(card.detail).toBeUndefined();
  });
});
