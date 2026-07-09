import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { EditorState, EditorSelection, RangeSetBuilder } from '@codemirror/state'
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
  dropCursor,
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, HighlightStyle, syntaxTree } from '@codemirror/language'
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown'
import { WIKI_RE } from '../lib/loom'
import { rankWeave, type WeaveGroup } from '../lib/weave'
import type { Note } from '../lib/types'

/*
 * The note editor, built on CodeMirror 6 — the same engine Obsidian uses.
 * Real text editing (selection, undo, IME, paste), themed to Noto: serif prose,
 * amber caret + selection, live markdown styling. CodeMirror owns its DOM, so
 * React never resets the cursor. Edits parse markdown → blocks (debounced) so
 * the review session keeps rendering.
 */

const SERIF = "'Newsreader', Georgia, serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"

// Live markdown styling (Obsidian "source" feel): headings big serif, muted
// markers, amber inline code, italic quotes — plus code-token colors for the
// ~150 fence languages (SQL, Python, R, C++, …) from @codemirror/language-data,
// all themed via the Noto CSS variables so light/dark both work.
const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '600', fontFamily: SERIF, lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.4em', fontWeight: '600', fontFamily: SERIF, lineHeight: '1.3' },
  { tag: t.heading, fontSize: '1.2em', fontWeight: '600', fontFamily: SERIF },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--ac)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--ink3)' },
  { tag: [t.monospace], fontFamily: MONO, color: 'var(--am)', fontSize: '0.9em' },
  { tag: t.quote, color: 'var(--ink2)', fontStyle: 'italic' },
  { tag: [t.list], color: 'var(--am)' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--ink3)' },
  // ── Code-fence tokens (any language) ─────────────────────────────
  { tag: t.keyword, color: 'var(--ac)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--g4)' },
  { tag: [t.number, t.bool, t.atom, t.null], color: 'var(--am)' },
  { tag: [t.comment, t.blockComment, t.lineComment], color: 'var(--ink3)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--ac)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--am)' },
  { tag: [t.operator, t.definitionOperator], color: 'var(--ink2)' },
  { tag: [t.variableName, t.propertyName, t.labelName], color: 'var(--ink)' },
])

// ── Live preview (Notion-style WYSIWYG) ───────────────────────────────
// Markdown markers (#, **, *, ~~, `, link urls) are hidden as you write —
// type `**bold**` and it snaps to bold with the stars gone; type `# ` and
// the line becomes a heading with no hash. Formatting is applied live, not
// only in reading mode. To edit the raw syntax, *select across it* and the
// markers reappear. Display-only (Decoration.replace) — the stored markdown
// never changes; ⌘B / the format menu drive most formatting.

const HIDE_MARK: Record<string, string[]> = {
  HeaderMark: ['ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6'],
  EmphasisMark: ['StrongEmphasis', 'Emphasis'],
  StrikethroughMark: ['Strikethrough'],
  CodeMark: ['InlineCode'],
  LinkMark: ['Link'],
  URL: ['Link'],
}

function buildLivePreview(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  const sel = view.state.selection.ranges
  // Reveal the raw markers only where a NON-EMPTY selection overlaps them —
  // so a plain cursor keeps the text clean, but you can still select to edit.
  const selected = (from: number, to: number) =>
    sel.some((r) => r.from !== r.to && r.from < to && r.to > from)
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        const parents = HIDE_MARK[n.name]
        if (!parents) return
        const parent = n.node.parent
        if (!parent || !parents.includes(parent.name)) return
        if (selected(parent.from, parent.to)) return // selecting it → show source
        let end = n.to
        // Swallow the space after ATX hashes so `# hi` renders flush as `hi`.
        if (n.name === 'HeaderMark' && view.state.doc.sliceString(end, end + 1) === ' ') end++
        b.add(n.from, end, Decoration.replace({}))
      },
    })
  }
  return b.finish()
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = buildLivePreview(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

// ── [[Wikilinks]] — the knowledge web ─────────────────────────────────
// `[[Note title]]` links notes together. Brackets hide when the cursor is
// elsewhere (the title renders as an accent link); ⌘/Ctrl-click opens the
// note — or creates it if it doesn't exist yet.

/** The weave picker — autocomplete the moment `[[` is typed. Not a flat
 *  title list: candidates are ranked by context (lib/weave.ts) and grouped —
 *  notes sharing this note's tags/folder first, then your recent trail, then
 *  the archive (fuzzy: "tsa" finds "Transformer Self-Attention"). Whatever
 *  you type is always weavable via the `+ new` row, so linking never dead-ends
 *  no matter how big the vault grows. */
const WEAVE_SECTIONS: Record<WeaveGroup, { name: string; rank: number }> = {
  nearby: { name: '· woven nearby ·', rank: 0 },
  fresh: { name: '· fresh ink ·', rank: 1 },
  archive: { name: '· the archive ·', rank: 2 },
}
const NEW_SECTION = { name: '· new ·', rank: 9 }

const wikiSource =
  (noteId: string) =>
  (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[([^\][]*)$/)
    if (!m) return null
    const typed = m.text.slice(2)
    const { notes } = useData.getState()
    const current = notes.find((n) => n.id === noteId) ?? null
    const ranked = rankWeave(typed, current, notes, useUI.getState().trail)
    const options: Completion[] = ranked.map((c, i) => ({
      label: c.note.title,
      detail: c.detail || undefined,
      apply: c.note.title + ']]',
      type: 'text',
      boost: 99 - i,
      section: WEAVE_SECTIONS[c.group],
    }))
    if (typed.trim())
      options.push({
        label: `+ weave a new note “${typed.trim()}”`,
        apply: typed.trim() + ']]',
        type: 'text',
        boost: -99,
        section: NEW_SECTION,
      })
    if (!options.length) return null
    // filter: false — lib/weave.ts already fuzzy-filtered and ranked; the
    // source re-runs per keystroke (O(notes), trivial even at thousands).
    return { from: m.from + 2, options, filter: false }
  }

function buildWikilinks(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  const sel = view.state.selection.ranges
  const touches = (from: number, to: number) => sel.some((r) => r.to >= from && r.from <= to)
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    WIKI_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKI_RE.exec(text))) {
      const start = from + m.index
      const end = start + m[0].length
      const mark = Decoration.mark({
        class: 'nt-wl',
        attributes: { 'data-wl': m[1], title: '⌘/Ctrl-click to open “' + m[1] + '”' },
      })
      if (touches(start, end)) {
        b.add(start, end, mark) // cursor inside → show [[brackets]], still styled
      } else {
        b.add(start, start + 2, Decoration.replace({}))
        b.add(start + 2, end - 2, mark)
        b.add(end - 2, end, Decoration.replace({}))
      }
    }
  }
  return b.finish()
}

const wikilinks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildWikilinks(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = buildWikilinks(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

/** ⌘/Ctrl-click on a [[wikilink]] → open the note (create it if missing). */
function followWikilink(target: HTMLElement): boolean {
  const el = target.closest?.('.nt-wl') as HTMLElement | null
  const title = el?.getAttribute('data-wl')?.trim()
  if (!title) return false
  const { notes, newNote } = useData.getState()
  const found = notes.find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
  if (found) useUI.getState().openNote(found.id)
  else newNote(title)
  return true
}

const theme = EditorView.theme(
  {
    '&': { color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '15px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: SERIF, lineHeight: '1.75', overflow: 'visible' },
    '.cm-content': { padding: '2px 0', caretColor: 'var(--am)' },
    '.cm-line': { padding: '0 2px 0 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--am)', borderLeftWidth: '2px' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(184,122,38,0.16)' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(184,122,38,0.22)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--sf2)', outline: 'none' },
    '.cm-placeholder': { color: 'var(--ink3)', fontStyle: 'italic' },
    '.nt-wl': {
      color: 'var(--ac)',
      cursor: 'pointer',
      textDecoration: 'underline',
      textDecorationColor: 'rgba(53,81,142,0.35)',
      textUnderlineOffset: '3px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'var(--bg)',
      border: '1px solid var(--ln)',
      borderRadius: '11px',
      boxShadow: '0 18px 44px rgba(24,19,10,0.2)',
      overflow: 'hidden',
      padding: '4px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      fontFamily: SERIF,
      fontSize: '13px',
      color: 'var(--ink2)',
      padding: '5px 10px',
      borderRadius: '7px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--sf2)',
      color: 'var(--ink)',
    },
    '.cm-tooltip-autocomplete .cm-completionDetail': {
      fontFamily: MONO,
      fontSize: '8.5px',
      color: 'var(--am)',
      fontStyle: 'normal',
      marginLeft: '12px',
    },
    // (section headers are <completion-section> elements — styled in global.css,
    // since CM theme scoping doesn't reach custom-element selectors reliably)
  },
  { dark: false },
)

function insertImage(view: EditorView, file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    const url = reader.result as string
    const at = view.state.selection.main.head
    const label = 'image'
    view.dispatch({
      changes: { from: at, insert: `\n![${label}](${url})\n` },
      // Select the caption placeholder ("image") so it can be renamed at once,
      // rather than dropping the caret mid-marker.
      selection: { anchor: at + 3, head: at + 3 + label.length },
    })
  }
  reader.readAsDataURL(file)
}

// ── Formatting commands (right-click menu) ────────────────────────────
interface Sel {
  from: number
  to: number
  head: number
}

/** Wrap the selection in markers (toggles off if already wrapped). */
const FMT_NODE: Record<string, string> = {
  '**': 'StrongEmphasis',
  '*': 'Emphasis',
  '~~': 'Strikethrough',
  '`': 'InlineCode',
}

function wrapSel(view: EditorView, r: Sel, before: string, after = before) {
  const st = view.state
  // Collapsed caret → target the whole word under it, so ⌘B / the menu format
  // the word you're in (Notion-style) instead of inserting empty ** markers.
  if (r.from === r.to) {
    const w = st.wordAt(r.from)
    if (w && w.from !== w.to) r = { from: w.from, to: w.to, head: w.to }
  }
  const text = st.sliceDoc(r.from, r.to)
  // (0) syntax-aware toggle: if the caret/selection sits INSIDE a bold/italic/
  //     strike/code node, strip that whole node's markers — so ⌘B un-bolds a
  //     word you're just resting the cursor in, even with the ** hidden.
  const fmtName = before === after ? FMT_NODE[before] : undefined
  if (fmtName) {
    let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(st).resolveInner(r.from, 1)
    while (node && node.name !== fmtName) node = node.parent
    if (node && node.from <= r.from && node.to >= r.to && node.to - node.from >= before.length + after.length) {
      view.dispatch({
        changes: [
          { from: node.from, to: node.from + before.length, insert: '' },
          { from: node.to - after.length, to: node.to, insert: '' },
        ],
      })
      view.focus()
      return
    }
  }
  // (a) markers sit inside the selection → unwrap them.
  if (text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)) {
    const inner = text.slice(before.length, text.length - after.length)
    view.dispatch({ changes: { from: r.from, to: r.to, insert: inner }, selection: EditorSelection.range(r.from, r.from + inner.length) })
    view.focus()
    return
  }
  // (b) markers sit just OUTSIDE the selection (hidden by live preview) → strip
  //     them, so ⌘B on a bold word un-bolds it even with the ** hidden.
  const outBefore = st.sliceDoc(Math.max(0, r.from - before.length), r.from)
  const outAfter = st.sliceDoc(r.to, Math.min(st.doc.length, r.to + after.length))
  if (outBefore === before && outAfter === after) {
    view.dispatch({
      changes: [
        { from: r.from - before.length, to: r.from, insert: '' },
        { from: r.to, to: r.to + after.length, insert: '' },
      ],
      selection: EditorSelection.range(r.from - before.length, r.to - before.length),
    })
    view.focus()
    return
  }
  // (c) otherwise wrap — and collapse the caret to the end so the just-applied
  //     markers hide right away (a lingering selection would reveal them).
  view.dispatch({ changes: { from: r.from, to: r.to, insert: before + text + after }, selection: EditorSelection.cursor(r.to + before.length) })
  view.focus()
}

/** Set (or clear, level 0) the heading level on the caret's line. */
function setHeading(view: EditorView, r: Sel, level: number) {
  const line = view.state.doc.lineAt(r.head)
  const stripped = line.text.replace(/^#{1,6}\s+/, '')
  const prefix = level > 0 ? '#'.repeat(level) + ' ' : ''
  view.dispatch({ changes: { from: line.from, to: line.to, insert: prefix + stripped } })
  view.focus()
}

/** Toggle a line prefix (list / quote) across every line in the selection. */
function toggleLines(view: EditorView, r: Sel, prefix: string, re: RegExp) {
  const startN = view.state.doc.lineAt(r.from).number
  const endN = view.state.doc.lineAt(r.to).number
  const changes: { from: number; to?: number; insert: string }[] = []
  for (let n = startN; n <= endN; n++) {
    const line = view.state.doc.line(n)
    if (re.test(line.text)) changes.push({ from: line.from, to: line.to, insert: line.text.replace(re, '') })
    else changes.push({ from: line.from, insert: prefix })
  }
  view.dispatch({ changes })
  view.focus()
}

function codeBlock(view: EditorView, r: Sel) {
  const text = view.state.sliceDoc(r.from, r.to)
  view.dispatch({ changes: { from: r.from, to: r.to, insert: '```\n' + text + '\n```' }, selection: EditorSelection.cursor(r.from + 4) })
  view.focus()
}

function makeLink(view: EditorView, r: Sel) {
  const text = view.state.sliceDoc(r.from, r.to) || 'text'
  const insert = `[${text}](url)`
  const urlAt = r.from + text.length + 3
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.range(urlAt, urlAt + 3) })
  view.focus()
}

// ── Format palette (right-click) ──────────────────────────────────────
// Minimalist: three rows of square cells — inline styles, text sizes,
// blocks. Each glyph wears its own effect (the B is bold, the i is serif
// italic, the H chips shrink with the level) and the chip matching the
// caret line's current heading level glows amber.

interface FmState {
  x: number
  y: number
  r: Sel
}

const MENU_W = 192

function Cell({ title, active, onPick, children }: { title: string; active?: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <div
      className="tint"
      title={title}
      onClick={onPick}
      style={{
        flex: 1,
        height: 30,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: active ? 'var(--am)' : 'var(--ink2)',
        background: active ? 'var(--sf2)' : undefined,
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {children}
    </div>
  )
}

function FormatMenu({ fm, view, onClose }: { fm: FmState | null; view: EditorView | null; onClose: () => void }) {
  useEffect(() => {
    if (!fm) return
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the opening contextmenu event doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', onKey)
      window.addEventListener('wheel', close, { passive: true })
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', close)
    }
  }, [fm, onClose])

  if (!fm || !view) return null
  const { r } = fm
  const left = Math.max(8, Math.min(fm.x, window.innerWidth - MENU_W - 8))
  const top = Math.max(8, Math.min(fm.y, window.innerHeight - 156))
  // Which heading level is the caret's line already on? → active chip.
  const hMatch = view.state.doc.lineAt(r.head).text.match(/^(#{1,6})\s/)
  const lvl = hMatch ? Math.min(3, hMatch[1].length) : 0
  const pick = (fn: (v: EditorView, sel: Sel) => void) => () => {
    onClose()
    fn(view, r)
  }
  const row: CSSProperties = { display: 'flex', gap: 2 }
  const rule: CSSProperties = { height: 1, background: 'var(--ln)', margin: '5px 4px' }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top,
        left,
        width: MENU_W,
        zIndex: 200,
        background: 'var(--bg)',
        border: '1px solid var(--ln)',
        borderRadius: 13,
        boxShadow: '0 18px 44px rgba(24,19,10,0.24)',
        padding: 6,
        animation: 'rise 0.14s cubic-bezier(0.3,0.7,0.3,1) both',
      }}
    >
      <div style={row}>
        <Cell title="Bold · ⌘B" onPick={pick((v, s) => wrapSel(v, s, '**'))}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>B</span>
        </Cell>
        <Cell title="Italic · ⌘I" onPick={pick((v, s) => wrapSel(v, s, '*'))}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14.5 }}>i</span>
        </Cell>
        <Cell title="Strikethrough" onPick={pick((v, s) => wrapSel(v, s, '~~'))}>
          <s style={{ fontSize: 12.5 }}>S</s>
        </Cell>
        <Cell title="Inline code" onPick={pick((v, s) => wrapSel(v, s, '`'))}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--am)' }}>‹›</span>
        </Cell>
      </div>
      <div style={rule} />
      <div style={row}>
        <Cell title="Heading — large" active={lvl === 1} onPick={pick((v, s) => setHeading(v, s, 1))}>
          <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 15 }}>H</span>
        </Cell>
        <Cell title="Heading — medium" active={lvl === 2} onPick={pick((v, s) => setHeading(v, s, 2))}>
          <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 12.5 }}>H</span>
        </Cell>
        <Cell title="Heading — small" active={lvl === 3} onPick={pick((v, s) => setHeading(v, s, 3))}>
          <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 10.5 }}>H</span>
        </Cell>
        <Cell title="Body text" active={lvl === 0} onPick={pick((v, s) => setHeading(v, s, 0))}>
          <span style={{ fontFamily: SERIF, fontSize: 12.5 }}>¶</span>
        </Cell>
      </div>
      <div style={rule} />
      <div style={row}>
        <Cell title="Bullet list" onPick={pick((v, s) => toggleLines(v, s, '- ', /^\s*[-*]\s+/))}>
          <span style={{ fontSize: 14, color: 'var(--am)' }}>•</span>
        </Cell>
        <Cell title="Quote" onPick={pick((v, s) => toggleLines(v, s, '> ', /^>\s?/))}>
          <span style={{ fontFamily: SERIF, fontSize: 14 }}>❝</span>
        </Cell>
        <Cell title="Code block" onPick={pick((v, s) => codeBlock(v, s))}>
          <span style={{ fontFamily: MONO, fontSize: 10 }}>{'{ }'}</span>
        </Cell>
        <Cell title="Link" onPick={pick((v, s) => makeLink(v, s))}>
          <span style={{ fontSize: 12.5 }}>↗</span>
        </Cell>
        <Cell title="Weave [[note link]]" onPick={pick((v, s) => wrapSel(v, s, '[[', ']]'))}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ac)' }}>[[ ]]</span>
        </Cell>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'center', paddingTop: 5 }}>
        format
      </div>
    </div>
  )
}

/** Imperative hooks the Editor rail uses (e.g. one-click "weave" of an
 *  unwoven mention) — dispatches into the live view, so no remount/races. */
export interface EditorWeaveApi {
  /** Wrap the first plain-text occurrence of `title` in [[brackets]]. */
  weaveTitle: (title: string) => boolean
}

/** Floating selection toolbar state (Medium/Notion-style "weave bar"). */
interface WeaveBar {
  x: number
  y: number
  from: number
  to: number
  text: string
}

export function MarkdownEditor({ note, apiRef }: { note: Note; apiRef?: React.MutableRefObject<EditorWeaveApi | null> }) {
  const updateNote = useData((s) => s.updateNote)
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The latest markdown awaiting the debounced save (null once flushed).
  const pending = useRef<string | null>(null)
  const [fm, setFm] = useState<FmState | null>(null)
  const [bar, setBar] = useState<WeaveBar | null>(null)

  const onContextMenu = (e: MouseEvent) => {
    const view = viewRef.current
    if (!view) return
    e.preventDefault()
    const m = view.state.selection.main
    setFm({ x: e.clientX, y: e.clientY, r: { from: m.from, to: m.to, head: m.head } })
  }

  // Rebuild the editor only when the note changes (not on every keystroke).
  useEffect(() => {
    if (!host.current) return
    const noteId = note.id

    // Show the weave bar once a selection settles (mouseup / shift-key-up).
    const scheduleBar = (v: EditorView) => {
      setTimeout(() => {
        const m = v.state.selection.main
        if (m.empty || m.to - m.from > 120) return setBar(null)
        const c = v.coordsAtPos(m.from)
        if (!c) return
        setBar({ x: c.left, y: c.top, from: m.from, to: m.to, text: v.state.sliceDoc(m.from, m.to) })
      }, 0)
    }

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: blocksToMarkdown(note.blocks),
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          keymap.of([
            // Formatting shortcuts (before defaultKeymap so they win).
            { key: 'Mod-b', run: (v) => { const m = v.state.selection.main; wrapSel(v, { from: m.from, to: m.to, head: m.head }, '**'); return true } },
            { key: 'Mod-i', run: (v) => { const m = v.state.selection.main; wrapSel(v, { from: m.from, to: m.to, head: m.head }, '*'); return true } },
            // ⌘S: flush the pending autosave right now (muscle-memory comfort).
            {
              key: 'Mod-s',
              run: (v) => {
                clearTimeout(saveTimer.current)
                pending.current = null
                updateNote(noteId, { blocks: markdownToBlocks(v.state.doc.toString()) })
                useUI.getState().showToast('Saved — Noto autosaves anyway ✓')
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // codeLanguages: lazy-loaded per-language highlighting inside fences
          // (```sql, ```python, ```r, …) — the same registry Obsidian uses.
          markdown({ codeLanguages: languages }),
          livePreview,
          wikilinks,
          autocompletion({ override: [wikiSource(noteId)], icons: false }),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          placeholder('Write, in markdown — # heading · - list · > quote · ``` code · ![](img)'),
          EditorView.domEventHandlers({
            click(e) {
              if (e.metaKey || e.ctrlKey) return followWikilink(e.target as HTMLElement)
              return false
            },
            mouseup(_, v) {
              scheduleBar(v)
              return false
            },
            keyup(e, v) {
              if (e.shiftKey || e.key === 'Shift') scheduleBar(v)
              return false
            },
            blur(_, v) {
              // Hide the bar when focus truly leaves the editor. Bar clicks
              // preventDefault on mousedown, so they never blur it.
              setTimeout(() => {
                if (!v.hasFocus) setBar(null)
              }, 120)
              return false
            },
            paste(e, v) {
              const img = [...(e.clipboardData?.items ?? [])]
                .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
                .find((f) => f && f.type.startsWith('image/'))
              if (img) {
                e.preventDefault()
                insertImage(v, img)
                return true
              }
              return false
            },
            drop(e, v) {
              const img = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
              if (img) {
                e.preventDefault()
                insertImage(v, img)
                return true
              }
              return false
            },
          }),
          EditorView.updateListener.of((u) => {
            // Selection collapsed or the doc changed → the weave bar is stale.
            if (u.docChanged || (u.selectionSet && u.state.selection.main.empty)) setBar(null)
            if (!u.docChanged) return
            clearTimeout(saveTimer.current)
            const md = u.state.doc.toString()
            pending.current = md
            saveTimer.current = setTimeout(() => {
              updateNote(noteId, { blocks: markdownToBlocks(md) })
              pending.current = null
            }, 400)
          }),
        ],
      }),
    })

    // Persist any pending debounced edit before the editor goes away — on a
    // note switch (unmount) or a tab close/refresh (pagehide). Without this the
    // last <400ms of typing was silently lost.
    const flush = () => {
      clearTimeout(saveTimer.current)
      if (pending.current !== null) {
        updateNote(noteId, { blocks: markdownToBlocks(pending.current) })
        pending.current = null
      }
    }
    window.addEventListener('pagehide', flush)

    viewRef.current = view
    if (apiRef)
      apiRef.current = {
        weaveTitle: (title: string) => {
          const doc = view.state.doc.toString()
          const i = doc.toLowerCase().indexOf(title.toLowerCase())
          if (i < 0) return false
          if (doc.slice(Math.max(0, i - 2), i) === '[[') return false
          view.dispatch({
            changes: { from: i, to: i + title.length, insert: '[[' + doc.slice(i, i + title.length) + ']]' },
          })
          return true
        },
      }
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
      if (apiRef) apiRef.current = null
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // ── Weave-bar actions (operate on the captured selection) ──────────
  const weaveSel = () => {
    const v = viewRef.current
    if (!v || !bar) return
    v.dispatch({
      changes: { from: bar.from, to: bar.to, insert: '[[' + bar.text + ']]' },
      selection: EditorSelection.cursor(bar.to + 4),
    })
    setBar(null)
    v.focus()
    useUI.getState().showToast('Woven — ⌘-click to open')
  }
  const branchSel = () => {
    const v = viewRef.current
    if (!v || !bar) return
    const title = bar.text.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!title) return
    v.dispatch({ changes: { from: bar.from, to: bar.to, insert: '[[' + title + ']]' } })
    setBar(null)
    const { notes, newNote } = useData.getState()
    const exists = notes.find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
    if (exists) useUI.getState().showToast('That note already exists — woven to it')
    // Navigating unmounts this editor; the flush persists the [[link]] edit.
    else newNote(title)
  }
  const wrapBar = (marker: string) => {
    const v = viewRef.current
    if (!v || !bar) return
    wrapSel(v, { from: bar.from, to: bar.to, head: bar.to }, marker)
    setBar(null)
  }

  const barBtn = (accent = false): React.CSSProperties => ({
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 600,
    color: accent ? 'var(--ac)' : 'var(--ink2)',
    padding: '5px 9px',
    borderRadius: 7,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <>
      <div ref={host} onContextMenu={onContextMenu} />
      {/* Weave bar — floats above a settled selection */}
      {bar && (
        <div
          onMouseDown={(e) => e.preventDefault()} // keep the selection alive
          style={{
            position: 'fixed',
            left: Math.min(Math.max(8, bar.x), window.innerWidth - 248),
            top: Math.max(8, bar.y - 44),
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            background: 'var(--bg)',
            border: '1px solid var(--ln)',
            borderRadius: 10,
            padding: 3,
            boxShadow: '0 14px 34px rgba(24,19,10,0.22)',
            animation: 'rise 0.12s ease both',
          }}
        >
          <span className="tint" style={barBtn(true)} title="Link this phrase — ⌘-click opens it" onClick={weaveSel}>
            [[ weave
          </span>
          <span className="tint" style={barBtn()} title="Extract into a new linked note" onClick={branchSel}>
            ❧ branch
          </span>
          <span style={{ width: 1, height: 16, background: 'var(--ln)', margin: '0 2px' }} />
          <span className="tint" style={{ ...barBtn(), fontWeight: 800 }} title="Bold · ⌘B" onClick={() => wrapBar('**')}>
            B
          </span>
          <span className="tint" style={{ ...barBtn(), fontStyle: 'italic', fontFamily: SERIF, fontSize: 12 }} title="Italic · ⌘I" onClick={() => wrapBar('*')}>
            i
          </span>
        </div>
      )}
      <FormatMenu fm={fm} view={viewRef.current} onClose={() => setFm(null)} />
    </>
  )
}
