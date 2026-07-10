import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';

/*
 * Journal encryption at rest.
 *
 * The desktop derives its key from a passphrase (PBKDF2 -> AES-GCM). iOS can do
 * strictly better: a random 256-bit key lives in the Keychain behind biometry
 * (`requireAuthentication`), so Face ID doesn't gate a *screen* — it releases
 * the *key*. Without your face the ciphertext is noise, even to this app.
 *
 * A fresh 96-bit nonce per entry: AES-GCM is catastrophically broken by nonce
 * reuse, so it is never derived from anything, only sampled.
 *
 * NB: `@noble/ciphers` publishes an exports map with explicit `.js` suffixes.
 * Importing `@noble/ciphers/aes` (no suffix) fails to resolve under Metro.
 */

const KEY_ID = 'noto_journal_key_v1';

export interface Sealed {
  /** hex — 12 random bytes. */
  iv: string;
  /** hex — ciphertext with the GCM tag appended. */
  ct: string;
}

/** True when the key sits behind a biometric ACL rather than a plain keychain slot. */
let biometricSealed = false;
export const keyIsBiometric = () => biometricSealed;

async function readKeyHex(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  // The biometric read is what shows Face ID. Try it first; a key stored without
  // an ACL (device with no enrolled biometrics) is readable the plain way.
  try {
    const v = await SecureStore.getItemAsync(KEY_ID, { requireAuthentication: true });
    if (v) {
      biometricSealed = true;
      return v;
    }
  } catch {
    /* wrong ACL, cancelled, or no biometrics — fall through */
  }
  try {
    const v = await SecureStore.getItemAsync(KEY_ID);
    if (v) biometricSealed = false;
    return v;
  } catch {
    return null;
  }
}

async function writeKeyHex(hex: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_ID, hex, {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    biometricSealed = true;
    return;
  } catch {
    // No passcode/biometry enrolled, or Expo Go refused the ACL.
  }
  await SecureStore.setItemAsync(KEY_ID, hex, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  biometricSealed = false;
}

/**
 * Unlock (or, first time, mint) the journal key. Reading it triggers Face ID.
 * Returns null when the user cancels or the platform has no Keychain.
 */
export async function unlockKey(): Promise<Uint8Array | null> {
  if (Platform.OS === 'web') return null;

  const existing = await readKeyHex();
  if (existing) return hexToBytes(existing);

  const fresh = Crypto.getRandomBytes(32);
  await writeKeyHex(bytesToHex(fresh));
  // Read it straight back: proves the ACL works before any plaintext depends on it.
  const check = await readKeyHex();
  return check ? hexToBytes(check) : null;
}

export function seal(key: Uint8Array, plaintext: string): Sealed {
  const iv = Crypto.getRandomBytes(12);
  const ct = gcm(key, iv).encrypt(utf8ToBytes(plaintext));
  return { iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Returns null on a bad key or tampered ciphertext — GCM authenticates, so this is real. */
export function open(key: Uint8Array, sealed: Sealed): string | null {
  try {
    return bytesToUtf8(gcm(key, hexToBytes(sealed.iv)).decrypt(hexToBytes(sealed.ct)));
  } catch {
    return null;
  }
}

/** Panic switch: forget the key. Every entry becomes unreadable, forever. */
export async function destroyKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ID);
  } catch {
    /* already gone */
  }
}
