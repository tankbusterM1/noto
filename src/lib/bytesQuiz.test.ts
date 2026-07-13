import { describe, it, expect } from 'vitest';
import { clozeFor, checkpointFor } from './bytesQuiz';
import type { ByteCard } from './bytes';

const card = (over: Partial<ByteCard>): ByteCard => ({
  id: 'c1', updatedAt: 0, pack: 'p', topic: 'sql', level: 3, title: '', blurb: '', ...over,
});

describe('bytesQuiz.clozeFor', () => {
  it('blanks the concept keyword and offers it as the answer', () => {
    const c = card({ id: 'ranks', title: 'ROW_NUMBER vs RANK vs DENSE_RANK', code: 'RANK() OVER (ORDER BY score DESC)' });
    const cp = clozeFor(c)!;
    expect(cp).not.toBeNull();
    expect(cp.answer).toBe('RANK');
    expect(cp.prompt).toContain('_____');
    expect(cp.prompt).not.toMatch(/\bRANK\b/); // the target is gone from the prompt
    expect(cp.choices).toContain('RANK');
    expect(cp.choices.length).toBe(4);
  });

  it('uses same-family distractors', () => {
    const c = card({ id: 'ranks', title: 'RANK window', code: 'RANK() OVER (ORDER BY score)' });
    const cp = clozeFor(c)!;
    // RANK's family is ROW_NUMBER / DENSE_RANK — at least one should appear
    expect(cp.choices.some((x) => x === 'ROW_NUMBER' || x === 'DENSE_RANK')).toBe(true);
  });

  it('word-boundary: never blanks RANK inside DENSE_RANK', () => {
    const c = card({ id: 'dr', title: 'DENSE_RANK leaves no gaps', code: 'DENSE_RANK() OVER (ORDER BY score)' });
    const cp = clozeFor(c)!;
    expect(cp.answer).toBe('DENSE_RANK');
    expect(cp.prompt).not.toContain('DENSE_RANK');
    expect(cp.prompt.startsWith('_____()')).toBe(true);
  });

  it('is deterministic — same card, same choice order', () => {
    const c = card({ id: 'j', title: 'LEFT JOIN keeps every left row', code: 'FROM a LEFT JOIN b ON a.id = b.id' });
    expect(clozeFor(c)!.choices).toEqual(clozeFor(c)!.choices);
  });

  it('answer is always among the choices', () => {
    const c = card({ id: 'g', title: 'GROUP BY buckets rows', code: 'SELECT dept FROM emp GROUP BY dept' });
    const cp = clozeFor(c)!;
    expect(cp.choices).toContain(cp.answer);
  });

  it('returns null when there is nothing to blank', () => {
    expect(clozeFor(card({ id: 'x', title: 'Correlation is not causation', blurb: 'no code here' }))).toBeNull();
    expect(checkpointFor(card({ id: 'y', title: 'plain', code: 'the quick brown fox' }))).toBeNull();
  });
});
