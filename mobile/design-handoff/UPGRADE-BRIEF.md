# Upgrade brief

Read `DESIGN-SYSTEM.md`, `SCREENS.md`, `COMPONENTS.md` first. This is what to change, what not to, and how to hand it back.

The app works and syncs. This is a **feel** upgrade: make it read like a premium iOS 26 app while keeping Noto's paper-and-ink voice. Three goals, in priority order.

---

## Goal 1 — Make it look like Liquid Glass

**Problem:** the glass is wired correctly (`glass.tsx`) but used on exactly one element (the tab bar). Everything else is a flat `surface` card, so the app reads as generic, not iOS 26.

**Do:**
- Bring genuine glass to the moments that deserve depth: the **Journal lock card**, sheet-like surfaces, the **Today** hero/review card, section headers that float over scrolling content, and any bar that sits above scrolling content.
- Give interactive glass its **touch reactivity** (`isInteractive` / `interactive`) where the user presses it.
- Add a real sense of **layering** — content scrolling *under* glass, soft shadows, hairline light edges — so glass surfaces feel like they float above the paper, not painted on it.
- Keep the tab bar as the reference for quality; extend that quality outward.

**Constraints (non-negotiable — these are load-bearing, learned the hard way):**
- **Keep the `isGlassEffectAPIAvailable()` gate.** Never switch to `isLiquidGlassAvailable()`. Rendering `GlassView` when the API is absent crashes (expo/expo#40911).
- **Always keep the fallback chain** (`GlassView → BlurView → flat View with fallbackColor`). Many devices/builds won't have the API; they must still look intentional.
- **Don't over-tint.** A strong `tintColor` flattens the refraction into frosted plastic. Prefer no tint, or the palette's translucent paper.
- Don't make text unreadable over glass — keep enough contrast on `ink`/`ink2`.

**Done when:** on a real iOS 26 build the app has 4–6 well-chosen glass surfaces with depth and reactivity, and on a device without the API it still looks deliberate (blur/paper), never broken.

---

## Goal 2 — Make the haptics feel alive

**Problem:** the vocabulary is all there (`haptics` in `motion.tsx`) but under-used and monotone — mostly the lightest tap, nothing sequenced.

**Do:**
- **Choreograph** haptics to meaning, not one buzz for everything:
  - **Review grading** — each grade a distinct feel (e.g. Again = `warning`, Hard = `rigid`, Good = `medium`, Easy = `success`), and the **"re-ink" moment a short sequenced crescendo** (a couple of impacts a beat apart) — this is the app's signature moment and should feel rewarding.
  - **Toggles** (todo done, ink-fade switch) — a crisp `selection` or `rigid` tick.
  - **Sync success** — `success`; **sync failure / destructive** — `warning`/`error`.
  - **Sliders / segmented controls** — `selection` per step.
  - **Pull-to-refresh / long-press menus** — an impact on threshold.
- Consider a tiny helper for **sequenced haptics** (fire impacts on a short `setTimeout` chain) since ActivityKit-style patterns aren't available; keep it in `motion.tsx`.
- Don't over-do it — every *meaningful* action buzzes; scrolling and idle motion don't.

**Constraints:** use `expo-haptics` only (installed). Guard `Platform.OS === 'web'` (the helpers already do). Haptics must never block or delay the visual action.

**Done when:** every commit, toggle, outcome and navigation has an intentional, distinct feel, and grading a review is genuinely satisfying.

---

## Goal 3 — A custom launch animation

**Problem:** launch is a static splash image (`assets/splash-icon.png` on paper) then a text spinner (`App.tsx` → `Booting`, "SETTING THE TYPE…"). No brand moment.

**Do:**
- Design an **animated launch** built from the brand mark: the cream **N** and the **amber dot** (see `assets/icon.png`). Ideas — the N strokes draw on, the amber dot drops and settles with a spring, a faint paper grain, then a graceful hand-off into the app. Make it feel like ink meeting paper.
- Build it as a **React component** shown during boot, while fonts load (`useAppFonts`) and the vault hydrates (`useData(s => s.ready)`) — it replaces the current `Booting` view in `App.tsx`. When both are ready, cross-fade into the app (don't cut).
- It must be **fast and never block**: if boot finishes before the animation, still show at least one graceful beat, then transition; if boot is slow, loop calmly, never freeze.
- Pair a single, well-judged haptic with the moment the dot lands.

**Constraints:**
- Build with **`react-native-reanimated` (~4.1.1)** and/or **`react-native-svg` (15.12.1)** — both installed. The N is ideal as an SVG path with an animated stroke; the dot as an animated circle.
- **Pin `ReduceMotion.Never`** on every animation (the app opts out of reduce-motion globally on purpose — see `App.tsx`).
- Keep it on-brand: paper `#f4f1e9`, ink `#18130a`, amber `#b87a26`, Newsreader if any text.
- No new native module. No `expo-linear-gradient`/`expo-image`/Skia (not installed).

**Done when:** cold-launching the app plays a short, branded, buttery moment that resolves into Today, with no flash of unstyled content and no frozen frame.

---

## Do NOT touch

These are proven and off-limits. You may **read** the store to know what data a screen receives, but do not change data, crypto, or sync:

```
src/db.ts              src/store.ts (data/actions — read shape only, don't change signatures)
src/crypto.ts          src/vault.ts
src/journalCipher.ts   src/github.ts   src/githubAuth.ts   src/badge.ts   src/listRows.ts
../src/lib/**          (the shared sync engine + wire format — shared with the desktop)
app.json extra.githubClientId, bundleIdentifier, plugins
```

Changing any of these risks the encrypted-journal round-trip and the GitHub sync that both platforms depend on. If a design change *needs* a data or store change, **describe it in the changelog and leave it for me** — don't implement it.

## Free to change / add

```
src/theme.ts          (tokens — extend, don't rename existing ones others import)
src/glass.tsx         src/motion.tsx       src/ui.tsx       src/FloatingTabBar.tsx
src/screens/*.tsx     (presentational layer only — keep the store calls they make)
App.tsx               (to mount the launch animation)
NEW files             (e.g. src/Launch.tsx, src/components/*) — encouraged
```

---

## How to hand it back

Return, for each file you changed or added:

1. **The full file contents** (not a diff) — it gets pasted straight into `mobile/`.
2. A one-line note per file on what changed and why.
3. A short **changelog** at the top listing new dependencies (there should be none) and anything you couldn't do without touching the "do not touch" list.

Keep every import **Expo SDK 54-safe** — do not assume SDK 55+ modules (e.g. `expo-widgets`, `@expo/ui`) exist. If you're unsure a symbol exists in a pinned version, don't use it.

The result should typecheck against the current `tsconfig` (strict) and run under Reanimated 4 with worklets. When in doubt, match the patterns already in `motion.tsx` and `FloatingTabBar.tsx` — they're the house style.
