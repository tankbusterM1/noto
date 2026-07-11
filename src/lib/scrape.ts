/*
 * Best-effort client-side link scraping for Watch Later. No backend:
 *  1. noembed.com — a CORS-enabled oEmbed aggregator (YouTube, Vimeo, etc.)
 *     → title, thumbnail, author.
 *  2. YouTube thumbnails are derivable straight from the video id.
 *  3. Everything else: a CORS proxy fetch of the page → <title> + og:image.
 * All steps are wrapped so a failure just leaves the placeholder card intact.
 * (A tiny server/proxy would make step 3 reliable + add real durations.)
 */

export interface Scraped {
  title?: string
  thumb?: string
  source?: string
  mins?: number
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : 'https://' + url
}

// A pasted link is handed to third-party services (noembed, the CORS proxy) to
// fetch its title/thumbnail. A private share link can carry a secret in its
// query (`?token=…`), which would then leak to — and be logged by — those
// services. Strip the params that commonly hold secrets before sending; keep
// the rest (e.g. YouTube's `?v=…`, needed to resolve the video) so scraping
// still works. This is best-effort privacy, not a guarantee the URL stays local.
const SECRET_PARAM =
  /^(access[_-]?token|api[_-]?key|apikey|auth|authorization|token|secret|client[_-]?secret|password|passwd|pwd|session|sessionid|sig|signature)$/i

export function redactForScrape(rawUrl: string): string {
  const full = withProtocol(rawUrl)
  try {
    const u = new URL(full)
    let changed = false
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) {
        u.searchParams.delete(k)
        changed = true
      }
    }
    return changed ? u.toString() : full
  } catch {
    return full
  }
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/)
  return m ? m[1] : null
}

async function fetchTimeout(url: string, ms = 7000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

function metaTag(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const m = html.match(re) ?? html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  )
  return m?.[1]
}

function decode(s?: string): string | undefined {
  if (!s) return s
  const el = document.createElement('textarea')
  el.innerHTML = s
  return el.value
}

/**
 * Only trust absolute http(s) thumbnails from scraped (untrusted) pages. A
 * scheme-relative `//host/x.jpg` is legitimate (it resolves to https on our
 * https page) — normalise it rather than dropping the thumbnail.
 */
function safeThumb(u?: string): string | undefined {
  const s = u?.trim()
  if (!s) return undefined
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return 'https:' + s
  return undefined
}

export async function scrapeLink(rawUrl: string): Promise<Scraped> {
  const url = withProtocol(rawUrl)

  // Secret-bearing query params are dropped before the URL leaves the device.
  const safeUrl = redactForScrape(url)

  // 1. noembed (CORS-friendly)
  try {
    const r = await fetchTimeout('https://noembed.com/embed?url=' + encodeURIComponent(safeUrl))
    if (r.ok) {
      const d = (await r.json()) as {
        title?: string
        thumbnail_url?: string
        author_name?: string
        provider_name?: string
        error?: string
      }
      if (d && !d.error && (d.title || d.thumbnail_url)) {
        const source = [d.author_name, d.provider_name].filter(Boolean).join(' · ') || undefined
        const yt = youtubeId(url)
        return {
          title: decode(d.title),
          // safeThumb: the thumbnail comes from a third party — only trust an
          // absolute http(s) URL, never a javascript:/data: value.
          thumb: safeThumb(d.thumbnail_url) || (yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : undefined),
          source,
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 2. YouTube thumbnail direct
  const yt = youtubeId(url)
  if (yt) return { thumb: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }

  // 3. CORS proxy → Open Graph / <title>
  try {
    const html = await fetchTimeout(
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(safeUrl),
    ).then((r) => r.text())
    const title = decode(metaTag(html, 'og:title')) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1])
    const thumb = safeThumb(metaTag(html, 'og:image'))
    const source = metaTag(html, 'og:site_name')
    if (title || thumb) return { title: title?.trim(), thumb, source }
  } catch {
    /* fall through */
  }

  return {}
}
