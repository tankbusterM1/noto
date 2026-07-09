import { describe, it, expect } from 'vitest'
import { domainOf, fmtMins, stripInline, blocksWords, blocksSnippet } from './format'
import type { Block } from './types'

describe('blocksWords / blocksSnippet (draft + trash previews)', () => {
  const blocks: Block[] = [
    { t: 'h2', text: '# Heading' },
    { t: 'p', text: 'A short **paragraph** here.' },
    { t: 'ul', items: ['one', 'two three'] },
  ]
  it('counts words across text + list items', () => {
    // "# Heading"(2) + "A short **paragraph** here."(4) + "one two three"(3)
    expect(blocksWords(blocks)).toBe(9)
  })
  it('snippet is the first paragraph, markers stripped', () => {
    expect(blocksSnippet(blocks)).toBe('A short paragraph here.')
  })
  it('falls back to the first list item when there is no paragraph', () => {
    expect(blocksSnippet([{ t: 'ul', items: ['first item', 'second'] }])).toBe('first item')
  })
  it('handles an empty block list', () => {
    expect(blocksWords([])).toBe(0)
    expect(blocksSnippet([])).toBe('')
  })
})

describe('stripInline', () => {
  it('drops markdown markers but keeps the words', () => {
    expect(stripInline('**bold** and *it* and ~~gone~~ and `code`')).toBe('bold and it and gone and code')
    expect(stripInline('[Docs](https://example.com/x) here')).toBe('Docs here')
    expect(stripInline('# Heading line')).toBe('Heading line')
  })

  it('leaves non-markdown symbols alone', () => {
    expect(stripInline('use #tags and 2*3=6 math')).toBe('use #tags and 2*3=6 math')
    expect(stripInline('a > b, x & y')).toBe('a > b, x & y')
  })

  it('unwraps [[wikilinks]] to their title', () => {
    expect(stripInline('see [[B-Trees & Database Indexes]] for why')).toBe('see B-Trees & Database Indexes for why')
  })
})

describe('domainOf', () => {
  it('strips scheme + www and keeps the bare host', () => {
    expect(domainOf('https://www.example.com/a/b?q=1#x')).toBe('example.com')
    expect(domainOf('example.com')).toBe('example.com')
    expect(domainOf('http://sub.example.co.uk/path')).toBe('sub.example.co.uk')
  })

  it('is case-insensitive about the scheme (was returning "HTTPS:")', () => {
    expect(domainOf('HTTPS://WWW.Foo.com')).toBe('foo.com')
  })

  it('handles protocol-relative and non-http schemes without leaking the scheme', () => {
    expect(domainOf('//cdn.example.com/x')).toBe('cdn.example.com')
    expect(domainOf('ftp://files.example.com/f')).toBe('files.example.com')
  })

  it('falls back to "link" for empty input', () => {
    expect(domainOf('')).toBe('link')
    expect(domainOf('   ')).toBe('link')
  })
})

describe('fmtMins', () => {
  it('formats minutes and hours', () => {
    expect(fmtMins(26)).toBe('26m')
    expect(fmtMins(60)).toBe('1h')
    expect(fmtMins(116)).toBe('1h 56m')
  })

  it('guards NaN / negative / fractional input', () => {
    expect(fmtMins(NaN)).toBe('0m')
    expect(fmtMins(-5)).toBe('0m')
    expect(fmtMins(61.5)).toBe('1h 1m')
  })
})
