import { blockId, type Block } from './types'
import { domainOf } from './format'

/*
 * Markdown ⇄ typed blocks. The editor works in markdown (the note's storage
 * stays blocks so the SRS review session + cards keep rendering). Callouts are
 * blockquotes led by 💡; images inline as ![caption](src) (data-URL for uploads).
 */

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'h2':
          return '#'.repeat(Math.min(6, Math.max(1, b.level ?? 2))) + ' ' + (b.text ?? '')
        case 'ul':
          return (b.items ?? []).map((it) => '- ' + it).join('\n')
        case 'code':
          return '```' + (b.lang ?? '') + '\n' + (b.text ?? '') + '\n```'
        case 'q':
          return (b.text ?? '')
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n')
        case 'call':
          return (b.text ?? '')
            .split('\n')
            .map((l, i) => (i === 0 ? '> 💡 ' + l : '> ' + l))
            .join('\n')
        case 'img':
          return '![' + (b.text ?? '') + '](' + (b.src ?? '') + ')'
        case 'link':
          return '[' + (b.text ?? '') + '](' + (b.url ?? 'https://' + (b.domain ?? '')) + ')'
        default:
          return b.text ?? ''
      }
    })
    .join('\n\n')
}

export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  let para: string[] = []

  const flush = () => {
    if (para.length) {
      const text = para.join('\n').trim()
      if (text) blocks.push({ id: blockId(), t: 'p', text })
      para = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      flush()
      const lang = fence[1] || ''
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push({ id: blockId(), t: 'code', lang, text: body.join('\n') })
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flush()
      // Strip an optional run of trailing ATX hashes ("## Heading ##" → "Heading").
      const text = h[2].replace(/\s+#+\s*$/, '').trim()
      blocks.push({ id: blockId(), t: 'h2', level: h[1].length, text })
      i++
      continue
    }

    // `[^\s]+` (not `.+`) so a URL containing `)` (e.g. wiki paths) survives,
    // while a line with trailing prose after the link — which contains spaces —
    // fails the match and stays a paragraph instead of over-capturing.
    const img = line.match(/^!\[([^\]]*)\]\(([^\s]+)\)\s*$/)
    if (img) {
      flush()
      blocks.push({ id: blockId(), t: 'img', text: img[1], src: img[2] || undefined })
      i++
      continue
    }

    const link = line.match(/^\[([^\]]+)\]\(([^\s]+)\)\s*$/)
    if (link) {
      flush()
      blocks.push({ id: blockId(), t: 'link', text: link[1], url: link[2], domain: domainOf(link[2]) })
      i++
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ id: blockId(), t: 'ul', items })
      continue
    }

    if (/^>\s?/.test(line)) {
      flush()
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const text = q.join('\n')
      if (/^💡\s?/.test(text) || /^\[!/.test(text)) {
        blocks.push({
          id: blockId(),
          t: 'call',
          text: text.replace(/^💡\s?/, '').replace(/^\[![^\]]*\]\s?/, '').trim(),
        })
      } else {
        blocks.push({ id: blockId(), t: 'q', text })
      }
      continue
    }

    if (line.trim() === '') {
      flush()
      i++
      continue
    }

    para.push(line)
    i++
  }
  flush()

  if (blocks.length === 0) blocks.push({ id: blockId(), t: 'p', text: '' })
  return blocks
}
