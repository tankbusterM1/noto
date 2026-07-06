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
      { id: 'b', t: 'h2', level: 2, text: 'Section' },
      { id: 'c', t: 'ul', items: ['alpha', 'beta'] },
      { id: 'd', t: 'code', lang: 'sql', text: 'SELECT 1;' },
      { id: 'e', t: 'q', text: 'wisdom' },
      { id: 'f', t: 'call', text: 'note this' },
    ]
    const round = markdownToBlocks(blocksToMarkdown(original))
    // ids are regenerated on parse; compare the meaningful shape
    expect(strip(round)).toEqual(strip(original))
  })

  it('preserves heading levels (font sizes)', () => {
    const md = '# Big\n\n### Small'
    const blocks = markdownToBlocks(md)
    expect(blocks[0]).toMatchObject({ t: 'h2', level: 1, text: 'Big' })
    expect(blocks[1]).toMatchObject({ t: 'h2', level: 3, text: 'Small' })
    expect(blocksToMarkdown(blocks)).toBe(md)
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

  it('preserves a link’s full URL (path/query/fragment) across a round-trip', () => {
    const md = '[RFC](https://www.rfc-editor.org/rfc/rfc793#section-3.4)'
    const blocks = markdownToBlocks(md)
    expect(blocks[0].t).toBe('link')
    expect(blocks[0].url).toBe('https://www.rfc-editor.org/rfc/rfc793#section-3.4')
    expect(blocks[0].domain).toBe('rfc-editor.org')
    // The full href must survive serialization, not collapse to the bare domain.
    expect(blocksToMarkdown(blocks)).toBe(md)
  })

  it('keeps an image/link whose URL contains a closing paren', () => {
    const blocks = markdownToBlocks('![diagram](https://en.wikipedia.org/wiki/Foo_(bar).png)')
    expect(blocks[0].t).toBe('img')
    expect(blocks[0].src).toBe('https://en.wikipedia.org/wiki/Foo_(bar).png')
  })

  it('does NOT collapse a line with prose after a link into one link block', () => {
    // The url-with-paren fix must not over-capture: a line that has trailing
    // text after the link stays a paragraph rather than becoming a malformed link.
    expect(markdownToBlocks('[see](https://x.com) (note)')[0].t).toBe('p')
    expect(markdownToBlocks('[A](https://a.com) and [B](https://b.com)')[0].t).toBe('p')
  })

  it('drops trailing ATX hashes from a heading', () => {
    const blocks = markdownToBlocks('## Heading ##')
    expect(blocks[0]).toMatchObject({ t: 'h2', level: 2, text: 'Heading' })
  })
})
