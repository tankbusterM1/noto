import { describe, it, expect } from 'vitest'
import { blocksToMarkdown, markdownToBlocks } from './markdown'
import type { Block } from './types'

const strip = (blocks: Block[]) => blocks.map(({ id: _id, ...rest }) => rest)

describe('markdown ⇄ blocks', () => {
  it('parses each block type from markdown', () => {
    const md = [
      'A plain paragraph.',
      '',
      '## A heading',
      '',
      '- one',
      '- two',
      '',
      '```python',
      "print('hi')",
      '```',
      '',
      '> a quote',
      '',
      '> 💡 a callout',
    ].join('\n')
    const blocks = markdownToBlocks(md)
    expect(blocks.map((b) => b.t)).toEqual(['p', 'h2', 'ul', 'code', 'q', 'call'])
    expect(blocks[0].text).toBe('A plain paragraph.')
    expect(blocks[1].text).toBe('A heading')
    expect(blocks[2].items).toEqual(['one', 'two'])
    expect(blocks[3].lang).toBe('python')
    expect(blocks[3].text).toBe("print('hi')")
    expect(blocks[4].text).toBe('a quote')
    expect(blocks[5].t).toBe('call')
    expect(blocks[5].text).toBe('a callout')
  })

  it('every parsed block gets a stable id', () => {
    const blocks = markdownToBlocks('hello\n\n## world')
    expect(blocks.every((b) => !!b.id)).toBe(true)
  })

  it('round-trips blocks → markdown → blocks (content preserved)', () => {
    const original: Block[] = [
      { id: 'a', t: 'p', text: 'Intro line.' },
      { id: 'b', t: 'h2', text: 'Section' },
      { id: 'c', t: 'ul', items: ['alpha', 'beta'] },
      { id: 'd', t: 'code', lang: 'sql', text: 'SELECT 1;' },
      { id: 'e', t: 'q', text: 'wisdom' },
      { id: 'f', t: 'call', text: 'note this' },
    ]
    const round = markdownToBlocks(blocksToMarkdown(original))
    // ids are regenerated on parse; compare the meaningful shape
    expect(strip(round)).toEqual(strip(original))
  })

  it('handles an empty document', () => {
    const blocks = markdownToBlocks('')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].t).toBe('p')
  })

  it('parses a standalone link and an image', () => {
    const blocks = markdownToBlocks('[Docs](https://example.com/x)\n\n![a cat](data:image/png;base64,AAAA)')
    expect(blocks[0].t).toBe('link')
    expect(blocks[0].domain).toBe('example.com')
    expect(blocks[1].t).toBe('img')
    expect(blocks[1].src).toBe('data:image/png;base64,AAAA')
    expect(blocks[1].text).toBe('a cat')
  })
})
