import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes } from '@noble/ciphers/utils.js';
import { bytesToB64 } from '../../src/lib/b64';
import * as cipher from './journalCipher';

/*
 * Journal encryption — the same journal, on the phone and on the laptop.
 *
 * An earlier version of this file minted a random 256-bit key and locked it in
 * the Keychain behind Face ID. That is cryptographically lovely and completely
 * useless for sync: the desktop derives its key from a passphrase, so neither
 * device could read a word the other wrote.
 *
 * So the passphrase is the root of trust, exactly as on the desktop:
 *
 *     key = PBKDF2-SHA256(passphrase, salt, iterations) -> AES-256-GCM
 *
 * The salt and iteration count live in the vault (`journal/crypto.json`), so both
 * devices derive the *same* key from the same passphrase. Face ID doesn't replace
 * that — it caches it: after the first unlock the derived key is sealed in the
 * Keychain behind a biometric ACL, so opening the journal costs a glance instead
 * of six hundred thousand hash rounds.
 *
 * The bytes themselves live in `./journalCipher`, which has no platform in it and
 * is tested directly against the desktop's Web Crypto implementation.
 *
 * NB: `@noble/*` publishes an exports map with explicit `.js` suffixes.
 * Importing `@noble/ciphers/aes` (no suffix) fails to resolve under Metro.
 */

/** Where the *derived* key is cached. Deliberately not the old random-key slot. */
const DK_ID = 'noto_journal_dk_v1';
/** The salt the cached key was derived from. A new salt invalidates the cache. */
const DK_SALT_ID = 'noto_journal_dk_salt_v1';
/** The pre-sync random key. Only ever read, to migrate entries off it. */
const LEGACY_KEY_ID = 'noto_journal_key_v1';

export type { Cipher, VaultCrypto } from './journalCipher';
export {
  checkVerifier,
  CURRENT_ITERATIONS,
  decryptJSON,
  DEFAULT_ITERATIONS,
  deriveKey,
  isLegacyEnvelope,
  VERIFIER,
} from './journalCipher';

/** A fresh 96-bit nonce, sampled and never derived. */
const nonce = () => Crypto.getRandomBytes(12);

export const encryptJSON = (key: Uint8Array, value: unknown): cipher.Cipher => cipher.encryptJSON(key, value, nonce());
export const makeVerifier = (key: Uint8Array): cipher.Cipher => cipher.makeVerifier(key, nonce());
export const randomSalt = (): string => bytesToB64(Crypto.getRandomBytes(16));

// ── the Keychain cache ────────────────────────────────────────────────
/** True when the key sits behind a biometric ACL rather than a plain slot. */
let biometricSealed = false;
export const keyIsBiometric = () => biometricSealed;

async function writeSecret(id: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(id, value, {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    biometricSealed = true;
    return;
  } catch {
    // No passcode/biometry enrolled, or Expo Go refused the ACL.
  }
  await SecureStore.setItemAsync(id, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  biometricSealed = false;
}

async function readSecret(id: string): Promise<string | null> {
  // The biometric read is what shows Face ID. Try it first; a key stored without
  // an ACL (device with no enrolled biometrics) is readable the plain way.
  try {
    const v = await SecureStore.getItemAsync(id, { requireAuthentication: true });
    if (v) {
      biometricSealed = true;
      return v;
    }
  } catch {
    /* wrong ACL, cancelled, or no biometrics — fall through */
  }
  try {
    const v = await SecureStore.getItemAsync(id);
    if (v) biometricSealed = false;
    return v;
  } catch {
    return null;
  }
}

/**
 * Is there a cached key for this vault? Reads only the salt marker, never the
 * key — so it can be called on launch without throwing a Face ID prompt at
 * someone who only wanted to look at their notes.
 */
export async function hasCachedKey(saltB64: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const cachedSalt = await SecureStore.getItemAsync(DK_SALT_ID).catch(() => null);
  return cachedSalt === saltB64;
}

/**
 * The derived key for this vault, if Face ID says so. Reading it IS the prompt.
 * Null means "ask for the passphrase" — either nothing is cached, the user
 * cancelled, or the vault was re-encrypted under a salt this key doesn't match.
 */
export async function cachedKey(saltB64: string): Promise<Uint8Array | null> {
  if (Platform.OS === 'web') return null;
  if (!(await hasCachedKey(saltB64))) return null;
  const hex = await readSecret(DK_ID);
  return hex ? hexToBytes(hex) : null;
}

export async function cacheKey(key: Uint8Array, saltB64: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await writeSecret(DK_ID, bytesToHex(key));
  await SecureStore.setItemAsync(DK_SALT_ID, saltB64);
}

/** Panic switch. The entries stay; they're unreadable until the passphrase is typed again. */
export async function forgetKey(): Promise<void> {
  for (const id of [DK_ID, DK_SALT_ID]) {
    try {
      await SecureStore.deleteItemAsync(id);
    } catch {
      /* already gone */
    }
  }
}

// ── migrating off the old random key ──────────────────────────────────
/*
 * Entries written before this file existed are AES-GCM under a random Keychain
 * key, hex-encoded, and their plaintext is a bare string rather than
 * `{text, words}`. They are perfectly readable — but only here, only now, while
 * the old key still exists. Retiring that key without re-encrypting them first
 * would destroy them silently, and nothing would ever say so.
 */
export async function legacyKey(): Promise<Uint8Array | null> {
  if (Platform.OS === 'web') return null;
  const hex = await readSecret(LEGACY_KEY_ID);
  return hex ? hexToBytes(hex) : null;
}

/** The old format sealed the raw text, hex-encoded. Null if this key can't open it. */
export function openLegacy(key: Uint8Array, c: cipher.Cipher): string | null {
  try {
    return bytesToUtf8(gcm(key, hexToBytes(c.iv)).decrypt(hexToBytes(c.ct)));
  } catch {
    return null;
  }
}

export async function destroyLegacyKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_KEY_ID);
  } catch {
    /* already gone */
  }
}
