# Screens

The real code for each is in [`source-current/screens/`](source-current/screens/). Descriptions below are the intent and structure; the file is the source of truth.

## Navigation (from `App.tsx`)

Five bottom tabs, rendered by the custom `FloatingTabBar`:

```
Today      (stack: TodayHome → Todos → Watch)
Notes      (stack: NotesList → Note)
Review     (single screen)
Journal    (single screen — from screens/Vault.tsx)
Settings   (single screen — from screens/Vault.tsx)
```

Plus a **circular "+" button** in the tab bar (not a tab): creates a note and pushes the Note editor. Todos and Watch-Later are reached from **Today**, because Apple caps the tab bar at five and those two are secondary.

---

## Today — `screens/Today.tsx` (the home / dashboard)

The landing screen. A large title with a **time-aware greeting** ("Good morning/afternoon/evening"), then a scroll of cards:

- **Review CTA** — "N notes are fading" with a start-review button. The hero.
- **A 7-day review forecast** (little bars).
- **Recently edited notes** — a few note cards (with ink-fade opacity and SRS pill), "All notes →".
- **Today's list** — a preview of open todos, "Open todos →" pushes Todos.
- **Journal** — the streak, a prompt, "Write today's entry →".
- **Resurface** — a daily pick from the archive ("Do you still remember —").
- **Up next · Watch later** — the top of the watch queue.

This screen is the best candidate for glass depth and a rich entrance stagger.

## Notes — `screens/Notes.tsx`

A vertical list of **note cards**: title (Newsreader), a snippet (from the shared markdown→snippet), tags (mono), an SRS status pill, and **ink opacity driven by memory**. New note via the tab-bar "+". Tapping a card pushes the editor.

## Note — `screens/Note.tsx` (the editor)

The touch editor: an editable **title** and a **markdown body**, tags, autosave. This is where the desktop's CodeMirror experience becomes a native `TextInput`. Largest screen (312 lines). Keep it calm and typographic — it's for writing.

## Review — `screens/Review.tsx` (the FSRS session)

Whole-note review (not flashcards — there is deliberately **no blur/reveal gate**). Shows a due note, and four grade buttons: **Again · Hard · Good · Easy**. Grading records to the ledger and re-inks the note. This screen owns the app's most emotional moment — "re-inking" a faded note — and currently celebrates it with almost nothing. Prime target for sequenced haptics + a satisfying transition.

## Todos — `screens/Todos.tsx`

A todo list: an add row, check-to-toggle, optional `#tag`. Reached from Today. Pushed onto the app icon as a badge.

## Watch — `screens/Watch.tsx`

Watch-later: paste a URL, it classifies (video / article / paper), fetches a title, shows a card with a hue or thumbnail. Reached from Today.

## Journal — `screens/Vault.tsx` → `JournalScreen`

Encrypted. Three states:
- **Locked, key cached** → a Face ID unlock card (glass).
- **Locked, no cache** → passphrase entry (first unlock per device; ~1s on desktop, a few seconds on the phone, then Face ID forever).
- **No passphrase yet** → "choose a passphrase" to encrypt.
- **Unlocked** → today's entry composer (one entry per day, editable) + past entries as cards.

The lock card is a signature glass moment. Make it feel like a vault.

## Settings — `screens/Vault.tsx` → `SettingsScreen`

Appearance (light/dark segmented — dark not yet wired on iOS), accent, ink-fade toggle; **Sync** (repo name + GitHub token, or one-tap device-flow sign-in); daily digest toggle; Face ID / glass **diagnostics**. Long screen (Vault.tsx is 852 lines total for both journal + settings).

---

## The floating tab bar — `FloatingTabBar.tsx`

The one piece already doing Liquid Glass well, and the reference for the rest:

- A detached **62pt glass pill** (5 tabs) + a separate **62pt glass circle** ("+"), both inside one `GlassGroup` so real glass makes them sample & merge — but held **12pt apart** so they stay two distinct bodies (Apple keeps Music/News/App Store buttons distinct; fusing them makes an ugly concave seam).
- A **spring-driven amber capsule slides under the active tab** (the thing that makes it feel alive) — width derived from screen size, not measured.
- Each icon **springs on press** (`scale 0.86`) and **lifts + scales when selected** (`scale 1.1, translateY -1.5`), outline→filled Ionicon, `ink3`→`amber`.
- Tabs fire `selection` haptic; the "+" fires `medium` and **spins the plus 90° and back**.
- Shadow lives on an un-clipped wrapper because the glass surface clips for its radius.
