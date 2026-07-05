# Handoff: Noto — Notes app with our own SRS (spaced repetition)

## Overview
Noto is a lifelong-learning notes app for CS / AI / engineering study. It combines: a hierarchical notes library, a rich note editor (code/image/link/quote/callout blocks), a **note-level SRS** (spaced repetition on whole notes — NOT flashcards), a private daily journal, a todo system (today / week / month + rituals + date-ranged goals), a watch-later queue with link scraping, and an app-wide **tag "thread"** system that ties notes, videos and todos together. Desktop (PC) is the hero; an iOS companion exists as a second prototype.

The signature idea: **a note's ink fades as its memory decays.** Notes approaching their review date literally lose opacity across the whole app; reviewing "re-inks" them. This metaphor should be preserved 1:1.

## About the design files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, motion, and behavior. They are **not production code to ship directly.**

The prototype is authored in a small internal HTML component format (a `.dc.html` file with an inline template + a `class Component` logic block, inline styles only, and `{{ }}` template holes). **Do not try to run or port that format.** Instead, **recreate these designs in the target codebase's real environment** using its established patterns:
- If a stack exists, use it (React + CSS-in-JS / Tailwind / CSS Modules, Vue, SwiftUI for the iOS app, etc.).
- If nothing exists yet, the recommended stack is **React + TypeScript + Vite**, styling with CSS variables (the theme maps cleanly to them), and **local-first persistence** (see State & Persistence). For the real iOS app, SwiftUI + SwiftData mirrors this model well.

The prototype fakes persistence, URL scraping, and file storage. Everything else (SRS scheduler math, tag threads, palette search, active-recall gate, forecast/heatmap) is really computed and should be reproduced exactly.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and motion are final. Recreate the UI pixel-faithfully using the codebase's libraries. Exact tokens and animation specs are below.

---

## Design tokens

Everything is driven by CSS variables set per-theme on a root wrapper. Ship them as CSS custom properties (or a theme object). Two themes: light (default) and dark.

### Color — light
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F4F1E9` | app background (warm paper) |
| `--sf` | `#FBF9F3` | surface / card |
| `--sf2` | `#EDE9DD` | secondary surface / chip / track |
| `--ink` | `#211D14` | primary text |
| `--ink2` | `#6E6557` | secondary text |
| `--ink3` | `#A79D8C` | tertiary text / muted / placeholder |
| `--ln` | `#E3DCCC` | hairline borders / dividers |
| `--cd` | `#221E15` | code-block background |
| `--am` | `#B87A26` | amber accent (SRS "due", streaks, tags) |
| `--ac` | `#35518E` | primary accent (default; user-tweakable) |
| `--acI` | `#F7F5EE` | ink on primary accent |
| `--g1` | `#B0523C` | grade "Again" (terracotta) |
| `--g2` | `#B87A26` | grade "Hard" (amber) |
| `--g4` | `#4A7350` | grade "Easy" (green); "Good" uses `--ac` |

### Color — dark
`--bg:#14110C; --sf:#1D1912; --sf2:#282218; --ink:#ECE6D8; --ink2:#A69C89; --ink3:#6E6557; --ln:#2E2820; --cd:#0E0C08; --am:#D9A45C; --g1:#D98D77; --g2:#D9A45C; --g4:#93BB98;`
Dark accent is desaturated toward the paper: `--ac: color-mix(in oklab, <accent> 45%, #E8E4D8); --acI:#14110C;`

Accent is a **user tweak** — default `#35518E`, curated options `#35518E` (blue), `#4A7350` (green), `#7D4A34` (rust), `#41414B` (slate).

### Typography
- **Serif — `Newsreader`** (Google Fonts, weights 400/500/600 + italic). Used for all headings, note titles, journal body, and "editorial" accents. This is the app's voice.
- **Mono — `JetBrains Mono`** (400/500/600). Used for metadata, labels, counts, timestamps, kbd hints, code. Labels are `letter-spacing:0.14–0.16em; text-transform:uppercase; ~9.5–11px`.
- **Sans — system UI stack** (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) for body/UI text (13–14.5px).
- Big display headings: 36–42px, weight 500, `letter-spacing:-0.015em`, `line-height:1.1`.

### Spacing / shape
- Screen padding: `44px 48px 120px`; content max-widths 880–1120px depending on screen.
- Radii: cards `14–20px`, chips/pills `999px`, small controls `7–11px`, code blocks `13px`.
- Borders: `1px solid var(--ln)` hairlines everywhere; dashed `var(--ink3)` for empty/drop states.
- Shadows are soft and warm: e.g. toolbar `0 4px 14px rgba(38,30,14,0.06)`, drawers `-24px 0 60px rgba(24,19,10,0.18)`, palette `0 30px 80px rgba(24,19,10,0.3)`.
- Density is intentionally dual: airy dashboards, dense list/queue/month rows.

### Iconography
All icons are **custom inline SVG**, 1.5–1.6 stroke, rounded caps/joins — hand-drawn feel (sunrise "Today", pen-nib "Notes", ribbon-bookmark "Journal", diamond "Review", play "watch"). No icon-font, no emoji. Keep this set.

---

## Global chrome

- **Left sidebar (collapsible).** 236px expanded → 64px slim icon-rail; caret at top rotates 180°; labels fade (`opacity`) and section headers collapse height to 0. Width transitions `0.45s cubic-bezier(0.65,0,0.35,1)`. During a review session the sidebar width goes to `0`. Nav: Today, then "Workspace" (Notes ·count, Journal, Todos ·count-left, Watch Later), then "Memory" (Review, with an amber count badge when expanded / amber dot when slim). Footer: vault line (`local-first · N files`), Search row (⌘K), Appearance toggle showing current theme.
- **Command palette (⌘K).** Fixed, top 14%, width 560px, centered with `left:0;right:0;margin:0 auto` (do **not** center with `translateX(-50%)` if you also animate transform — it cancels the centering). Fuzzy-search across notes/videos/todos + actions ("Start review session", "Write today's journal", "Toggle appearance", "Open month planner"). ↑/↓ move selection (wraps), ↵ runs, esc closes. Rows show a colored kind tag (note=amber, watch=blue, todo=green, action=muted).
- **Toast.** Bottom-center pill, `--ink` bg, mono text, auto-dismiss ~2.4s, `popin` animation.
- **Page switcher.** Small fixed pill bottom-center linking Desktop ↔ iPhone prototypes; hidden during a session.

---

## Screens / views (desktop)

### 1. Today (dashboard)
- Header: mono date line + serif greeting (time-aware: morning/afternoon/evening).
- Grid `1.6fr / 1fr`. Left: **Review hero** (`--ac` filled card) with due headline ("N notes are fading."), Start-session button, and a 7-day forecast bar chart (bars rise on load). Below: **Recently edited** note cards (ink-faded by SRS state, re-ink on hover; staggered `rise`).
- Right column: **Today's list** (progress bar + first todos), **Journal** teaser (privacy lock glyph, week streak dots, italic prompt), **Up next · watch later** (2 items, gradient tile → opens watch drawer).

### 2. Notes library
- Header: "Library · N notes", search input, dark "New note" button.
- **Collapsible folder tree** (216px) with real hierarchy: expand/collapse carets, indentation per depth, per-folder counts, "All notes", "New folder". Tree collapses to a thin reopen tab.
- Content: breadcrumb path, **subfolder cards** (folder icon, name, count) for the current folder, then a responsive **note-card grid** (`minmax(290px,1fr)`). Cards: serif title, 2-line snippet (ink-faded by SRS), folder chip + `#tags`, footer with updated-time and SRS pill. Search shows a flat result set with a "results for …" line.

### 3. Note editor
- Centered 700px column. Breadcrumb (folder path) + "edited …".
- **Sticky formatting toolbar**: H1, H2, Bold, Italic, • list, `</>` code, image, link, quote (❝), divider (—). Bold/italic/H1/H2/list use `document.execCommand` on the contentEditable; code/image/link/quote **append a typed block**.
- Title is contentEditable serif 37px; `#tags` under it (clickable → thread).
- Body = ordered **blocks**: `p` (15px/1.75), `h2` (serif 23px), `ul` (amber diamond bullets), `code` (dark card, mono, horizontal scroll, **click the language chip to cycle** python→sql→rust→go→typescript→c→bash), `q` (left amber rule, serif italic), `img` (dashed drop zone + caption), `link` (favicon-initial tile + title + domain + external-arrow), `call` (callout: lightbulb + text on `--sf2`). All blocks are contentEditable.
- **Right "Memory" rail (collapsible).** If the note is in review: state ("In review — due now"), big next-review label, next date, and interval / ease / reviews stats; a "Review this note now" button when due. Then **Review history** — one row per past review: colored grade dot, date, grade name, `→ interval`. If not in review: dashed card with "Add to review" (seeds ease 2.5, interval 1d, due tomorrow). Below: Details (folder/created/words) and **Marginalia** — up to 3 related notes sharing a tag ("via #ml"), clickable.

### 4. Review queue
- Header + "Start session · N due".
- **Memory-health band**: a single segmented bar (overdue `--g1` / due `--am` / this week `--ac` / settled `--g4`) that grows from the left (`growx`), with a legend; beside it a compact 7-day forecast.
- **Year-in-ink heatmap**: 26 weeks × 7 days of cells; darkness = reviews that day (opacity ramp on `--ac`); empty days `--sf2`; **today is `--am`**; less→more legend.
- **Due list** (amber-diamond rows: title, path · interval, last-3-grade dots trail, overdue/due label). Empty state: "All caught up — nothing due. Your ink is dark."
- **Upcoming grouped** into Tomorrow / This week / Later, each a bordered list (hollow-diamond rows with date + relative due).

### 5. Review session (the core SRS loop)
- Sticky top bar: "End session", progress bar, "n / total".
- **Active-recall gate:** the note body renders **blurred** (`filter:blur(10px)`, non-interactive) behind a centered card "What do you remember?". User recalls, then **Reveal (space)** un-blurs. Grade buttons are **hidden until reveal.**
- Card content = the whole note (same block renderer as editor, read-only).
- **Grade bar (keys 1–4):** Again `--g1` / Hard `--g2` / Good `--ac` / Easy `--g4`. Each button shows its **predicted next interval** as a hint. After grading, the next card re-blurs (gate resets).
- Completion state: wax-seal diamond **stamps** in (`stamp` keyframe), summary ("N reviews · queue clear / N still due"), grade tallies, "Back to queue".

### 6. Journal (private)
- **Privacy:** entries render behind `filter:blur(9px)` with a centered "This journal is private" unlock card by default; a lock/unlock toggle in the header. Nothing readable until unlocked.
- Today card: mono date, **prompted / blank-page** toggle (prompted shows a rotating italic question), large serif contentEditable (min 230px). Save button flips to a green confirm + fills today's streak dot.
- **Scratchpad** card: rule-free, dateless contentEditable for fragments.
- Right: week streak (dots) + **Earlier entries** list (date, word count, 2-line snippet).

### 7. Todos (today / week / month)
- Segmented control: Today · This week · Month.
- **Today:** checklist with animated check + strike (see Motion), progress bar; side column has **Goals this week** (round amber checkboxes), **Rituals** (permanent daily habits with 🔶 streak counts), and **Ongoing** (date-to-date commitments drawn as progress bars: "day X of Y").
- **Week:** 7 day-columns (today outlined amber), each with its dated items.
- **Month:** full calendar grid; today's cell amber-ringed; each day shows dot-items and **date-ranged commitments as horizontal bars** spanning start→end (rounded caps at the ends). Cells cascade in.
- Todos can carry a **tag** (clickable → thread) and an optional **direct link** to a specific note or video (tiny play/pen-nib chip on the row that opens that exact item).

### 8. Watch Later
- Header: paste-a-link input + Save; stats line ("N queued · Xh of material · N finished").
- **Add flow:** on save, a **shimmer skeleton card** appears ("scraping title · thumbnail · duration…"), then resolves to a real card — kind inferred from domain (youtube→video, arxiv/acm/ieee→paper, else article).
- Filter chips: kind (All/Video/Article/Paper) + **tag chips**.
- **Card grid:** gradient thumbnail (hue per item) with kind glyph, domain + duration overlays, title, source · added, `#tags`, and a circular **mark-watched** control (fills green + check draws; whole card dims — no strike-through).
- **Detail drawer** (right, slides in): big thumbnail, editable title, kind/source/duration/added, url row, Mark-watched + delete, **Tags** (add/remove/create + suggested tags), and a "My notes" contentEditable ("Why did you save this?").

---

## Interactions & behavior

- **Navigation** is single-page state (`screen` switch): today, notes, editor, queue, session, journal, todos, watch. Opening a note sets `noteId` + `screen:'editor'`. Opening a video sets `wOpenId` (+ screen watch). Clicking a tag anywhere sets `thread`.
- **Tag threads (app-wide).** Every `#tag` (note cards, editor, watch cards, drawer chips, todo rows) is clickable and opens a right **thread drawer** with a dashed amber "stitched" timeline listing everything carrying that tag grouped as Notes / Watch later / Todos, each row navigating to the item. Stitches appear staggered.
- **Keyboard:** ⌘/Ctrl-K palette (global); in palette ↑/↓/↵/esc; in session `space` reveals, `1–4` grade; `esc` closes thread → drawer → session in that priority.
- **Hover/active:** cards lift `translateY(-1/-2px)` + border darkens to `--ink3`; all buttons/press targets get `transform:scale(0.9–0.98)` on `:active`; nav/rows tint to `--sf2`.

### Motion (match these — each animation fits its meaning)
Keyframes: `rise` (opacity+translateY 10px), `fadein`, `popin` (toast), `stamp` (rotate45 scale 0.4→1.09→1 overshoot), `growx` (scaleX 0→1), `chipin` (scale 0.6→1), `drawerin` (translateX 46px→0), `shimmer` (background-position for skeletons).
- **Todo done** → check path draws via `stroke-dashoffset` (12→0, `0.3s cubic-bezier(0.65,0,0.35,1)`), then a strike line sweeps across the text via animated `width` 0→100%. (Pen finishing a task.)
- **Watched item** → circle fills + check draws, card **fades/dims** — deliberately **no** strike (you don't cross out a video).
- **Note memory** → opacity is a function of SRS due/interval; hover/grade restores to 1. (Ink fading/re-inking.)
- **Journal** → blur/unblur frost; save fills the streak dot + button → green.
- **Session done** → seal `stamp`. **Memory band** → `growx`. **Forecast/heatmap** → bars/height ease in. **Link add** → `shimmer` skeleton. **Collapse** (sidebar/tree/rail) → eased width + rotating caret. **Month cells / thread stitches / recent cards** → staggered `rise`. **Drawers** → `drawerin`. **Chips** → `chipin`. Standard transition easing is `cubic-bezier(0.65,0,0.35,1)`, 0.15s for hovers, 0.3–0.5s for state changes.

---

## SRS algorithm (reproduce exactly — this is our own, note-level, Anki-inspired)

Each in-review note has `{ ease (default 2.5, floor 1.3), ivl (interval, days), due (days from today; ≤0 means due), hist: [{ d: dayOffset, g: grade, ivl }] }`.

On grade `g` (1 Again, 2 Hard, 3 Good, 4 Easy):
- **1 Again:** `ease = max(1.3, ease − 0.2)`; `ivl = max(1, round(ivl × 0.5))`; `due = 0`; **requeue the note later in the same session.**
- **2 Hard:** `ease = max(1.3, ease − 0.15)`; `ivl = max(1, round(ivl × 1.2))`; `due = ivl`.
- **3 Good:** `ivl = max(1, round(ivl × ease))`; `due = ivl`.
- **4 Easy:** `ease = ease + 0.1`; `ivl = max(2, round(ivl × ease × 1.3))`; `due = ivl`.
- Always append `{ d:0, g, ivl }` to history; increment reviewed-today.
- **Predicted-interval hints** shown on buttons: Again → "10 min"; Hard → `round(ivl×1.2)d`; Good → `round(ivl×ease)d`; Easy → `round(ivl×ease×1.3)d`.
- **Due set** = notes with `due ≤ 0`, sorted ascending by `due` (most overdue first). **Forecast** buckets counts by `max(0,due)` over the next 7 days.
- **Ink opacity** = `due ≤ 0 → 0.55`, else `min(1, 0.55 + 0.45 × due/max(ivl,1))`. (Tie the visual fade to this.)

Reviews are **whole-note** (no sections, no card fronts/backs). Show next-review dates and per-note history — both are required product features.

---

## State management

Prototype uses one component's state; in production model these as stores/tables:
- `notes` (id, title, folderId, tags[], created, updated, blocks[]) — blocks are typed (`p/h2/ul/code+lang/q/img/link/call`).
- `folders` (id, name, parentId) — arbitrary depth.
- `srs` keyed by noteId (see algorithm) — the review ledger; source of due/forecast/heatmap/history.
- `session` (queue[], idx, log[]) + `sRevealed` (active-recall gate) + `doneToday`.
- `todos`, `goals`, `week` (day 0–6), `rituals` (streak), `ranged` (from/to day, hue) — each todo may have `tag` and `ref:{type:'note'|'watch', id}`.
- `watch` (id, kind, title, source, mins, url, tags[], note, done, hue, loading).
- `journal` entries + `jLocked`, `jMode` (prompt/blank).
- `tagsPool` (shared tag vocabulary across notes/watch/todos).
- UI: `screen`, `noteId`, `dark`, `slim` (sidebar), tree/rail collapse, `thread`, `wOpenId`, `pal`/`palIdx`, `libFolder`/`libQ`, filters, `toast`.

## State & persistence (production guidance)
Make it **local-first / lifelong**: notes as plain **Markdown files** the user owns; the **SRS ledger + metadata in SQLite** (or SwiftData on iOS); sync via iCloud/Git. No mandatory server. Real work to add beyond the prototype: actual file storage, real URL scraping (title/thumbnail/duration) for watch-later, full-text search over note **bodies** (palette currently matches titles/tags/meta), image upload, and journal encryption-at-rest.

## Tweakable props (already designed)
- `accent` (color) — default `#35518E`, options blue/green/rust/slate.
- `inkFade` (boolean) — master switch for the memory-fade effect.

## Assets
No external image/logo assets — all icons are inline SVG (recreate as an icon set). Fonts: Newsreader + JetBrains Mono (Google Fonts). Watch-later thumbnails are CSS gradients keyed by a per-item hue (replace with real scraped thumbnails in production).

## Files in this bundle
- `Noto.dc.html` — the desktop app (all 8 screens + palette + threads + drawers). Primary reference.
- `Noto iOS.dc.html` — iOS companion prototype (5-tab app: Today, Notes, Review, Journal, Todos; folder drill-down; floating grade bar; note sheet). Secondary reference; less complete than desktop.
- `ios-frame.jsx`, `support.js` — prototype runtime/frame only; **ignore for implementation.**
- `versions/` — earlier snapshots; ignore.

To view: open the `.dc.html` files in the same viewer used in this conversation. They are references — implement in your real stack per the notes above.
