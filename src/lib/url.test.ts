import { describe, it, expect } from 'vitest'
import { safeHref } from './url'

describe('safeHref', () => {
  it('passes the safe contact/web schemes through unchanged', () => {
    expect(safeHref('https://example.com/x?y=1#z')).toBe('https://example.com/x?y=1#z')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('HTTPS://Example.com')).toBe('HTTPS://Example.com') // case preserved
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeHref('tel:+15551234')).toBe('tel:+15551234') // non-scripting, opens the dialer
    expect(safeHref('sms:+15551234')).toBe('sms:+15551234')
  })

  it('passes relative / same-document / bare refs (no scheme → cannot be javascript:)', () => {
    expect(safeHref('/notes/1')).toBe('/notes/1')
    expect(safeHref('#anchor')).toBe('#anchor')
    expect(safeHref('example.com/x')).toBe('example.com/x')
    expect(safeHref('./rel')).toBe('./rel')
  })

  it('blocks javascript: in every disguise', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined()
    expect(safeHref('  javascript:alert(1)')).toBeUndefined() // leading space
    expect(safeHref('java\tscript:alert(1)')).toBeUndefined() // tab in scheme
    expect(safeHref('java\nscript:alert(1)')).toBeUndefined() // newline in scheme
    expect(safeHref('javascript:alert(1)')).toBeUndefined() // control prefix
  })

  it('blocks other dangerous schemes (default-deny)', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
    expect(safeHref('blob:https://x/uuid')).toBeUndefined()
    expect(safeHref('filesystem:https://x/a')).toBeUndefined()
  })

  it('handles empty / nullish input', () => {
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
    expect(safeHref('   ')).toBeUndefined()
  })
})
