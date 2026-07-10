/*
 * base64, in pure JavaScript.
 *
 * The browser has `btoa`/`atob` and Node has `Buffer`; Hermes reliably has
 * neither. Since the desktop and the phone must produce byte-identical
 * ciphertext envelopes, the encoding cannot depend on which globals happen to
 * exist — one platform silently emitting URL-safe base64, or padding
 * differently, would make every journal entry unreadable on the other device.
 *
 * Standard alphabet, standard `=` padding: the exact output of `btoa`.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, built once. -1 marks a character that isn't base64. */
const INDEX = /* @__PURE__ */ (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63];
    out += c === undefined ? '=' : ALPHABET[n & 63];
  }
  return out;
}

/** Throws on anything that isn't base64 — a silent partial decode would surface as a bad GCM tag. */
export function b64ToBytes(text: string): Uint8Array {
  let end = text.length;
  while (end > 0 && text[end - 1] === '=') end--;

  const out = new Uint8Array((end * 3) >> 2);
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? INDEX[code] : -1;
    if (value < 0) throw new Error('not base64');

    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}
