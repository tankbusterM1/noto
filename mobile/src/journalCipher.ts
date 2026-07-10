import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64ToBytes, bytesToB64 } from '../../src/lib/b64';

/*
 * The journal cipher, with no platform in it.
 *
 * Everything here is a byte-for-byte contract with `src/lib/crypto.ts`, which
 * does the same job on the desktop through Web Crypto. Hermes has no Web Crypto,
 * so the two implementations are necessarily different code — which is exactly
 * why this file is separated from the Keychain: it can be run in Node, against
 * the desktop's real module, and proved to agree. See `src/lib/journalInterop.test.ts`.
 *
 *   KDF        PBKDF2-HMAC-SHA256(passphrase, salt, iterations) -> 32 bytes
 *   cipher     AES-256-GCM, 12-byte nonce, 16-byte tag appended, no AAD
 *   encoding   standard base64 for salt, iv and ct — never hex, never base64url
 *   payload    JSON.stringify(value)
 *
 * The nonce is a parameter rather than a global: AES-GCM is catastrophically
 * broken by nonce reuse, and a caller-supplied source makes it impossible for
 * this module to quietly seed itself with something predictable.
 */

export interface Cipher {
  iv: string;
  ct: string;
}

export interface VaultCrypto {
  salt: string;
  iterations: number;
  verifier: Cipher;
}

/** The plaintext behind a verifier token. Identical to the desktop's constant. */
export const VERIFIER = 'noto-journal-ok';
/** OWASP guidance for PBKDF2-SHA256. Used for newly-encrypted vaults. */
export const CURRENT_ITERATIONS = 600_000;
/** What a vault encrypted before the count was recorded used. */
export const DEFAULT_ITERATIONS = 150_000;

/** The expensive step, on purpose: this cost is what a thief pays per guess. */
export function deriveKey(passphrase: string, saltB64: string, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(passphrase), b64ToBytes(saltB64), { c: iterations, dkLen: 32 });
}

export function encryptJSON(key: Uint8Array, value: unknown, iv: Uint8Array): Cipher {
  if (iv.length !== 12) throw new Error('AES-GCM needs a 12-byte nonce');
  return { iv: bytesToB64(iv), ct: bytesToB64(gcm(key, iv).encrypt(utf8ToBytes(JSON.stringify(value)))) };
}

/** Null on a wrong key or a tampered blob — GCM authenticates, so this is real. */
export function decryptJSON<T>(key: Uint8Array, cipher: Cipher): T | null {
  try {
    return JSON.parse(bytesToUtf8(gcm(key, b64ToBytes(cipher.iv)).decrypt(b64ToBytes(cipher.ct)))) as T;
  } catch {
    return null;
  }
}

export const makeVerifier = (key: Uint8Array, iv: Uint8Array): Cipher => encryptJSON(key, VERIFIER, iv);
export const checkVerifier = (key: Uint8Array, c: Cipher): boolean => decryptJSON<string>(key, c) === VERIFIER;

// ── the pre-sync format ───────────────────────────────────────────────
/** Legacy envelopes are hex: a 12-byte iv is 24 hex chars, but only 16 base64 ones. */
export const isLegacyEnvelope = (iv: string): boolean => /^[0-9a-f]{24}$/i.test(iv);
