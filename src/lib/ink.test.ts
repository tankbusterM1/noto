import { describe, it, expect } from 'vitest'
import { HL_SRC, TC_SRC, HL_SCAN, TC_SCAN, RULE_RE, PENS, PEN_KEY } from './ink'
import { markdownToBlocks } from './markdown'

const hl = new RegExp('^' + HL_SRC + '$')
const tc = new RegExp('^' + TC_SRC + '$')

describe('ink — highlighter + text colour syntax', () => {
  it('reads a bare ==highlight== as the default amber pen', () => {
    const m = '==just this=='.match(hl)
    expect(m?.[1]).toBeUndefined() // no pen named → caller falls back to amber
    expect(m?.[2]).toBe('just this')
  })

  it('reads every named pen, for both marks', () => {
    for (const pen of PENS) {
      expect(`==${pen}:text==`.match(hl)?.[1]).toBe(pen)
      expect(`%%${pen}:text%%`.match(tc)?.[1]).toBe(pen)
    }
  })

  it('rejects a pen it does not know, rather than inventing a token', () => {
    // `--hl-undefined` would silently render as no highlight at all.
    expect('==chartreuse:text=='.match(hl)?.[1]).toBeUndefined()
    expect('%%chartreuse:text%%'.match(tc)).toBeNull()
  })

  it('every pen has a token suffix', () => {
    for (const pen of PENS) expect(PEN_KEY[pen]).toMatch(/^[a-z]$/)
  })

  /*
   * The read view splits one big alternation with String.split, which splices
   * EVERY capture group into its output — so the scan patterns must have none,
   * or highlighted text would be duplicated on the page.
   */
  it('scan patterns carry no capture groups, so split() stays clean', () => {
    const re = new RegExp('(' + HL_SCAN + '|' + TC_SCAN + ')', 'g')
    expect('a ==hi== b'.split(re)).toEqual(['a ', '==hi==', ' b'])
    expect('a %%blue:hi%% b'.split(re)).toEqual(['a ', '%%blue:hi%%', ' b'])
  })

  it('does not run across a line break', () => {
    expect('==open\nclosed=='.match(hl)).toBeNull()
  })
})

describe('ink — the divider', () => {
  it('matches the three markdown rules, and nothing that merely contains them', () => {
    for (const ok of ['---', '***', '___', '  ---  ', '-----']) expect(RULE_RE.test(ok)).toBe(true)
    for (const no of ['--', 'a---', '--- x', '- - -']) expect(RULE_RE.test(no)).toBe(false)
  })

  /*
   * A `---` line is now its own `div` block (the block editor added the type),
   * so it no longer folds into the paragraph above it — the case this test was
   * originally written to pin down. RULE_RE stays: notes written before the
   * block model still hold their rules as paragraphs of dashes, and the read
   * view keeps drawing those as a line.
   */
  it('is its own block, and no longer folds into the prose above it', () => {
    const tight = markdownToBlocks('some prose\n---\n')
    expect(tight.map((b) => b.t)).toEqual(['p', 'div'])
    expect(tight[0].text).toBe('some prose')

    const fenced = markdownToBlocks('some prose\n\n---\n\nmore prose')
    expect(fenced.map((b) => b.t)).toEqual(['p', 'div', 'p'])
  })

  it('still reads a legacy paragraph of dashes as a rule', () => {
    expect(RULE_RE.test('---')).toBe(true)
  })
})
