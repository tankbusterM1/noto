/*
 * Journal encryption at rest (Web Crypto). A passphrase is stretched with
 * PBKDF2-SHA256 (150k iterations) into a non-extractable AES-GCM key that
 * lives only in memory while unlocked. IndexedDB stores just salt + a verifier
 * token + per-entry {iv, ct} ciphertext — never the passphrase or plaintext.
 * Someone with the raw database cannot read the journal without the passphrase.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

export interface Cipher {
  iv: string
  ct: string
}

function b64(buf: ArrayBuffer): string {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function randomSalt(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { iv: b64(iv.buffer), ct: b64(ct) }
}

export async function decryptJSON<T>(key: CryptoKey, cipher: Cipher): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(cipher.iv) }, key, unb64(cipher.ct))
  return JSON.parse(dec.decode(pt)) as T
}

const VERIFIER = 'noto-journal-ok'

export async function makeVerifier(key: CryptoKey): Promise<Cipher> {
  return encryptJSON(key, VERIFIER)
}

export async function checkVerifier(key: CryptoKey, cipher: Cipher): Promise<boolean> {
  try {
    return (await decryptJSON<string>(key, cipher)) === VERIFIER
  } catch {
    return false
  }
}
