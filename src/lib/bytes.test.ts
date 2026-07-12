import { describe, it, expect } from 'vitest';
import { parseBatch, toCard, cardToRow, cardToMarkdown, type ByteCard } from './bytes';
import { emptyVault, vaultToFiles, filesToVault, mergeVaults, type SyncRow } from './sync';

const CARD: ByteCard = {
  id: 'b_1', updatedAt: 100, pack: 'foundations', topic: 'sql', level: 1,
  title: 'LEFT JOIN keeps every left row', blurb: 'Unmatched right side is NULL.',
  code: 'SELECT 1;', lang: 'sql', source: 'Docs',
};

describe('parseBatch', () => {
  it('parses a two-card batch: topic, title, body, fenced code', () => {
    const text = [
      '## sql · joins :: LEFT JOIN keeps every left row',
      'Unmatched right side comes back NULL.',
      '```sql',
      'SELECT u.name FROM users u',
      'WHERE o.id IS NULL;',
      '```',
      '---',
      '## python · traps :: The mutable-default trap',
      'A default list is made once, at definition.',
    ].join('\n');
    const cards = parseBatch(text, 'foundations', 111);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ topic: 'sql', title: 'LEFT JOIN keeps every left row', pack: 'foundations', updatedAt: 111, lang: 'sql' });
    expect(cards[0].blurb).toBe('Unmatched right side comes back NULL.');
    expect(cards[0].code).toContain('SELECT u.name');
    expect(cards[1]).toMatchObject({ topic: 'python', title: 'The mutable-default trap' });
    expect(cards[1].code).toBeUndefined();
    expect(cards[0].id).not.toBe(cards[1].id);
  });

  it('takes the first word of a multi-word topic label, lowercased', () => {
    const [c] = parseBatch('## ML · transformers :: Attention is a weighted average\nfoo', 'p', 0);
    expect(c.topic).toBe('ml');
  });

  it('skips blank and header-less blocks instead of erroring', () => {
    expect(parseBatch('\n\njust prose, no header\n\n', 'p', 0)).toHaveLength(0);
    expect(parseBatch('', 'p', 0)).toHaveLength(0);
  });
});

describe('toCard', () => {
  it('reads a stored row and rejects a titleless one', () => {
    expect(toCard({ id: 'x', updatedAt: 1 } as SyncRow)).toBeNull();
    const c = toCard({ id: 'x', updatedAt: 1, title: 'T', blurb: 'B', topic: 'sql', level: 2 } as SyncRow);
    expect(c).toMatchObject({ id: 'x', title: 'T', topic: 'sql', level: 2 });
  });
});

describe('cardToMarkdown', () => {
  it('renders blurb + fenced code + source', () => {
    const md = cardToMarkdown(CARD);
    expect(md).toContain('Unmatched right side is NULL.');
    expect(md).toContain('```sql\nSELECT 1;\n```');
    expect(md).toContain('— Docs');
  });
});

describe('bytes ride the vault', () => {
  it('survive a vaultToFiles → filesToVault round-trip', () => {
    const v = emptyVault();
    v.bytes = [cardToRow(CARD)];
    const back = filesToVault(vaultToFiles(v));
    expect(back.bytes).toHaveLength(1);
    expect(back.bytes[0]).toMatchObject({ id: 'b_1', title: CARD.title, topic: 'sql' });
  });

  it('merge cards by id (LWW) across two vaults', () => {
    const a = emptyVault();
    a.bytes = [cardToRow({ ...CARD, id: 'b_a', updatedAt: 1 })];
    const b = emptyVault();
    b.bytes = [cardToRow({ ...CARD, id: 'b_b', updatedAt: 2 })];
    const { vault } = mergeVaults(a, b);
    expect(vault.bytes.map((r) => r.id).sort()).toEqual(['b_a', 'b_b']);
  });

  it('a tombstone deletes a card in merge', () => {
    const a = emptyVault();
    a.bytes = [cardToRow({ ...CARD, id: 'b_x', updatedAt: 1 })];
    const b = emptyVault();
    b.tombstones = [{ id: 'b_x', deletedAt: 5 }];
    const { vault } = mergeVaults(a, b);
    expect(vault.bytes.find((r) => r.id === 'b_x')).toBeUndefined();
  });
});
