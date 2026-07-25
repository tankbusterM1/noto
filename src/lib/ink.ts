/*
 * The highlighter + text-colour pens, shared by the editor (CodeMirror
 * decorations) and the read views (NoteBlocks' inline renderer) so the two can
 * never drift apart on syntax or naming.
 *
 * Markdown standardises neither, so Noto defines the smallest syntax that still
 * reads as plain text in the raw file — and, because both forms live inside a
 * paragraph, survives the markdown ⇄ blocks round-trip untouched:
 *
 *   ==text==          the amber pen (matches the de-facto `==highlight==`
 *                     syntax Obsidian and friends use, so notes stay portable)
 *   ==green:text==    a named pen
 *   %%blue:text%%     coloured text — always names its pen, since there is no
 *                     "default" ink the way amber is the default highlighter
 *
 * Colours themselves live in tokens.css: highlights are translucent tints (one
 * value reads correctly on light and dark paper), text colours are opaque and
 * therefore per-theme.
 */

export const PENS = ['amber', 'green', 'blue', 'rose'] as const
export type Pen = (typeof PENS)[number]

/** Token suffix per pen — `--hl-a`, `--tc-a`, … */
export const PEN_KEY: Record<Pen, string> = { amber: 'a', green: 'g', blue: 'b', rose: 'p' }

const NAMES = PENS.join('|')

/** Highlighter: `==text==` / `==green:text==`. Group 1 = pen (optional), 2 = text. */
export const HL_SRC = `==(?:(${NAMES}):)?([^=\\n]+)==`
/** Text colour: `%%green:text%%`. Group 1 = pen, 2 = text. */
export const TC_SRC = `%%(${NAMES}):([^%\\n]+)%%`

/*
 * Capture-free twins. `String.split(re)` splices every capture group into its
 * output, so the read view's one big alternation must not carry any — these are
 * the same patterns with the groups made non-capturing.
 */
export const HL_SCAN = `==(?:(?:${NAMES}):)?(?:[^=\\n]+)==`
export const TC_SCAN = `%%(?:${NAMES}):(?:[^%\\n]+)%%`

/** A line that is nothing but `---` (or `***` / `___`) — the divider. */
export const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
