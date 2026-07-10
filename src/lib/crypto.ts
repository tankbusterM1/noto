/*
 * Journal encryption at rest (Web Crypto). A passphrase is stretched with
 * PBKDF2-SHA256 into a non-extractable AES-GCM key that lives only in memory
 * while unlocked. IndexedDB stores just salt + iteration count + a verifier
 * token + per-entry {iv, ct} ciphertext — never the passphrase or plaintext.
 * Someone with the raw database cannot read the journal without the passphrase.
 *
 * The iteration count is stored per-vault (see JournalCrypto) so it can be
 * raised for new vaults without locking out ones encrypted at an older count.
 * `DEFAULT_ITERATIONS` is the count assumed for vaults created before it was
 * recorded; `CURRENT_ITERATIONS` is used for newly-encrypted journals.
 */

import { b64ToBytes, bytesToB64 } from './b64'

const enc = new TextEncoder()
const dec = new TextDecoder()

export interface Cipher {
  iv: string
  ct: string
}

/*
 * The salt, iv and ct encodings are a cross-platform contract: the iOS app
 * derives the same key and reads the same ciphertext. `lib/b64` rather than
 * `btoa` because Hermes has no `btoa`, and a divergent encoder would make every
 * entry written on one device unreadable on the other.
 */
const b64 = (buf: ArrayBuffer | Uint8Array) => bytesToB64(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
const unb64 = b64ToBytes

export function randomSalt(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)))
}

/** The plaintext behind a verifier token. Both platforms encrypt exactly this. */
export const VERIFIER = 'noto-journal-ok'

/** Iteration count for vaults encrypted before the count was recorded. */
export const DEFAULT_ITERATIONS = 150_000
/** Iteration count for newly-encrypted vaults (OWASP guidance for PBKDF2-SHA256). */
export const CURRENT_ITERATIONS = 600_000

export async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { iv: b64(iv), ct: b64(ct) }
}

export async function decryptJSON<T>(key: CryptoKey, cipher: Cipher): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(cipher.iv) }, key, unb64(cipher.ct))
  return JSON.parse(dec.decode(pt)) as T
}

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
