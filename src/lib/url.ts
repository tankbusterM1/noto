/*
 * URL scheme allow-listing for anything the app turns into a clickable link —
 * a rendered <a href>, a window.open(), a Linking.openURL(). Note bodies sync
 * between devices, so a link's URL is untrusted input: `[x](javascript:…)` must
 * never become a live href. React 19 and modern browsers block javascript: URLs
 * on their own, but we don't rely on the framework — a future render path (or a
 * non-React consumer like the iOS Watch list) would reopen the hole.
 *
 * Default-deny: the safe contact/web schemes pass (http, https, mailto, tel,
 * sms); a relative / same-document ref passes (it has no scheme, so it can't be
 * javascript:); every explicit scheme we don't recognise — javascript:, data:,
 * vbscript:, file:, blob:, … — is rejected. tel/sms carry no scripting ability
 * and iOS/desktop open them natively, so blocking them only broke real links.
 */

const ALLOWED = new Set(['http', 'https', 'mailto', 'tel', 'sms'])

// Strip the chars a browser drops from a URL before resolving its scheme —
// C0 controls + space (<= 0x20), DEL (0x7f) and C1 controls (0x80-0x9f). Done by
// code point (not a regex) so no literal control byte ever lands in the source.
// This is why "java\tscript:alert(1)" must still be recognised as javascript:.
function stripControls(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f)) continue
    out += ch
  }
  return out
}

/**
 * The URL if it is safe to use as a link target, else `undefined`.
 * Returns the ORIGINAL string untouched when safe (callers keep exact round-trips).
 */
export function safeHref(url?: string | null): string | undefined {
  if (url == null) return undefined
  const raw = url.trim()
  if (!raw) return undefined
  const probe = stripControls(raw).toLowerCase()
  const scheme = probe.match(/^([a-z][a-z0-9+.-]*):/)
  if (!scheme) return raw // no scheme → relative / #hash / bare host — safe
  return ALLOWED.has(scheme[1]) ? raw : undefined
}
