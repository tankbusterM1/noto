import { describe, it, expect } from 'vitest'
import { blocksToMarkdown, markdownToBlocks } from './markdown'
import type { Block } from './types'

/*
 * The block editor added two types (`todo`, `div`). Notes sync as MARKDOWN, so
 * anything that doesn't survive blocks → markdown → blocks is data the vault
 * silently drops. These pin both directions.
 */

const strip = (bs: Block[]) => bs.map(({ id, ...rest }) => rest)

describe('todo blocks', () => {
  it('round-trips unticked and ticked', () => {
    const blocks: Block[] = [
      { t: 'todo', text: 'buy ink', done: false },
      { t: 'todo', text: 'refill pen', done: true },
    ]
    const md = blocksToMarkdown(blocks)
    expect(md).toBe('- [ ] buy ink\n\n- [x] refill pen')
    expect(strip(markdownToBlocks(md))).toEqual([
      { t: 'todo', text: 'buy ink', done: false },
      { t: 'todo', text: 'refill pen', done: true },
    ])
  })

  it('accepts an uppercase [X] from other editors', () => {
    expect(strip(markdownToBlocks('- [X] done elsewhere'))).toEqual([
      { t: 'todo', text: 'done elsewhere', done: true },
    ])
  })

  /*
   * The plain-bullet collector runs on the same `- ` prefix. Without a guard it
   * swallows task items and the checkboxes come back as literal "[ ] text".
   */
  it('does not let the bullet list swallow task items', () => {
    const blocks = strip(markdownToBlocks('- plain one\n- [ ] a task\n- plain two'))
    expect(blocks).toEqual([
      { t: 'ul', items: ['plain one'] },
      { t: 'todo', text: 'a task', done: false },
      { t: 'ul', items: ['plain two'] },
    ])
  })

  it('keeps a real bullet list intact', () => {
    expect(strip(markdownToBlocks('- one\n- two'))).toEqual([{ t: 'ul', items: ['one', 'two'] }])
  })
})

describe('divider blocks', () => {
  it('round-trips', () => {
    expect(blocksToMarkdown([{ t: 'div' }])).toBe('---')
    expect(strip(markdownToBlocks('---'))).toEqual([{ t: 'div' }])
  })

  it('accepts the other two thematic breaks', () => {
    for (const mark of ['***', '___', '-----']) {
      expect(strip(markdownToBlocks(mark))).toEqual([{ t: 'div' }])
    }
  })

  it('separates the paragraphs around it', () => {
    expect(strip(markdownToBlocks('above\n\n---\n\nbelow'))).toEqual([
      { t: 'p', text: 'above' },
      { t: 'div' },
      { t: 'p', text: 'below' },
    ])
  })
})

describe('the existing block types still round-trip', () => {
  it('survives a mixed note', () => {
    const blocks: Block[] = [
      { t: 'h2', level: 2, text: 'Heading' },
      { t: 'p', text: 'A paragraph.' },
      { t: 'ul', items: ['one', 'two'] },
      { t: 'todo', text: 'a task', done: true },
      { t: 'q', text: 'quoted' },
      { t: 'code', lang: 'ts', text: 'const x = 1' },
      { t: 'div' },
      { t: 'call', text: 'noticed' },
    ]
    expect(strip(markdownToBlocks(blocksToMarkdown(blocks)))).toEqual(blocks)
  })
})
