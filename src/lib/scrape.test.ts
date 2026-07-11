import { describe, it, expect } from 'vitest'
import { redactForScrape } from './scrape'

/*
 * A pasted link is sent to noembed + the CORS proxy to fetch its title/thumb.
 * Secret-bearing query params (a private share `?token=…`) must be stripped
 * before the URL leaves the device (F2), while ordinary params survive so
 * scraping keeps working.
 */
describe('redactForScrape', () => {
  it('drops secret params but keeps the rest', () => {
    const out = redactForScrape('https://x.com/s?token=abc123&v=keepme')
    expect(out).not.toContain('abc123')
    expect(out).toContain('v=keepme')
  })

  it('keeps a YouTube video id (scraping needs it)', () => {
    expect(redactForScrape('https://youtube.com/watch?v=dQw4w9WgXcQ')).toContain('v=dQw4w9WgXcQ')
  })

  it('adds https:// to a bare host and leaves a clean URL unchanged', () => {
    expect(redactForScrape('example.com/x')).toBe('https://example.com/x')
    expect(redactForScrape('https://example.com/x')).toBe('https://example.com/x')
  })

  it('covers the common secret param names', () => {
    for (const p of [
      'access_token',
      'api_key',
      'apikey',
      'auth',
      'authorization',
      'secret',
      'client_secret',
      'password',
      'pwd',
      'session',
      'sessionid',
      'sig',
      'signature',
    ]) {
      expect(redactForScrape(`https://x.com/?${p}=leak`)).not.toContain('leak')
    }
  })

  it('returns the URL untouched when it cannot be parsed', () => {
    // No throw, best-effort — junk still comes back with a protocol.
    expect(redactForScrape('not a url')).toBe('https://not a url')
  })
})
