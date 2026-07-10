import { describe, it, expect } from 'vitest'
import { b64ToBytes, bytesToB64 } from './b64'

const bytes = (...n: number[]) => Uint8Array.from(n)

describe('base64', () => {
  /*
   * The whole point of hand-rolling this: it must be indistinguishable from the
   * platform encoder, or the phone and the desktop disagree about ciphertext.
   */
  it('matches btoa byte for byte, at every padding length', () => {
    for (let len = 0; len < 40; len++) {
      const b = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 0xff)
      const native = btoa(String.fromCharCode(...b))
      expect(bytesToB64(b)).toBe(native)
    }
  })

  it('round-trips arbitrary bytes, including 0x00 and 0xff', () => {
    const b = bytes(0, 255, 1, 254, 127, 128, 0, 0, 0)
    expect([...b64ToBytes(bytesToB64(b))]).toEqual([...b])
  })

  it('handles the three padding cases', () => {
    expect(bytesToB64(bytes(1))).toBe('AQ==')
    expect(bytesToB64(bytes(1, 2))).toBe('AQI=')
    expect(bytesToB64(bytes(1, 2, 3))).toBe('AQID')
    expect([...b64ToBytes('AQ==')]).toEqual([1])
    expect([...b64ToBytes('AQI=')]).toEqual([1, 2])
    expect([...b64ToBytes('AQID')]).toEqual([1, 2, 3])
  })

  it('encodes and decodes empty input', () => {
    expect(bytesToB64(bytes())).toBe('')
    expect(b64ToBytes('')).toHaveLength(0)
  })

  it('decodes without the trailing padding, as some encoders omit it', () => {
    expect([...b64ToBytes('AQ')]).toEqual([1])
  })

  /* Silently skipping junk would turn a corrupt salt into a wrong key. */
  it('throws on non-base64 rather than decoding garbage', () => {
    expect(() => b64ToBytes('AQ!D')).toThrow()
    expect(() => b64ToBytes('a-b_')).toThrow() // URL-safe variant is NOT accepted
    expect(() => b64ToBytes('日本')).toThrow()
  })

  it('survives a full 256-byte alphabet', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect([...b64ToBytes(bytesToB64(all))]).toEqual([...all])
  })
})
