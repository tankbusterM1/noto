# Design System — current tokens

Every value here is copied verbatim from the source. Files: [`source-current/theme.ts`](source-current/theme.ts), [`source-current/fonts.ts`](source-current/fonts.ts), [`source-current/motion.tsx`](source-current/motion.tsx), [`source-current/glass.tsx`](source-current/glass.tsx).

---

## Color (`theme.ts` → `c`)

| Token | Hex | Role |
|-------|-----|------|
| `bg` | `#f4f1e9` | Paper — every screen background |
| `surface` | `#faf8f2` | Card surface, one step lighter than paper |
| `surface2` | `#efebdf` | Inset fields, pressed states |
| `ink` | `#18130a` | Primary text (near-black, warm) |
| `ink2` | `#6b6355` | Secondary text |
| `ink3` | `#9a9384` | Tertiary text, icons at rest, kickers |
| `line` | `#e3ddcf` | Hairline borders |
| `amber` | `#b87a26` | **The accent.** Active tab, due-for-review, brand dot |
| `accent` | `#35518e` | Ink blue — links, GitHub actions |
| `green` | `#4a7350` | Success / settled memory |
| `red` | `#a4402f` | Destructive, errors |
| `glassTint` | `rgba(250,248,242,0.62)` | Translucent paper for glass fallbacks |

It is a **warm, light, paper-first palette.** There is no dark mode on iOS yet (`userInterfaceStyle: "light"` in `app.json`). The whole thing should read like ink on good paper, not like a typical white-and-blue iOS app.

---

## Typography

Two real typefaces (loaded via `expo-font`, `fonts.ts`). **iOS ignores `fontWeight` on custom families — you pick the family for the weight**, so each weight is its own constant.

- **Newsreader** (serif, the prose voice): `Newsreader_400Regular`, `_400Regular_Italic`, `_500Medium`, `_600SemiBold`. Used for titles, note bodies, journal.
- **JetBrains Mono** (the machine voice): `JetBrainsMono_400Regular`, `_600SemiBold`. Used for kickers, tags, metadata, counts, code.

### Type scale (`theme.ts` → `t`) — Apple Dynamic Type default sizes

| Style | Size | Weight |
|-------|------|--------|
| `largeTitle` | 34 | 700, letter-spacing 0.37 |
| `title1` | 28 | 600 |
| `title2` | 22 | 600 |
| `title3` | 20 | 600 |
| `headline` | 17 | 600 |
| `body` | 17 | 400 |
| `callout` | 16 | 400 |
| `subhead` | 15 | 400 |
| `footnote` | 13 | 400 |
| `caption1` | 12 | 400 |
| `caption2` | 11 | 400 |

Large titles render in **Newsreader Medium**; kickers above them are **JetBrains Mono, uppercased, letter-spacing ~1.8**.

---

## Spacing & shape

- **Radius** (`theme.ts` → `radius`): `sm 8 · md 12 · lg 16 · xl 22`. Cards use `lg` (16). The tab pill and circle use a full `height/2` capsule (31).
- **Screen padding**: 20pt horizontal is the standard gutter.
- **Card**: `surface` fill, hairline `line` border, radius 16, padding 16.
- **Hairlines** use `StyleSheet.hairlineWidth`, never 1.

---

## The signature: ink fade

A note's ink opacity tracks its memory. `theme.ts` → `inkOpacity(recall)`:

```
recall === null (never reviewed)  ->  1.0   (full ink)
otherwise                         ->  0.42 + 0.58 * recall
```

So a well-remembered note is crisp; one that's fading is literally faint on the page, and reviewing it re-inks it. `recall` is the FSRS retrievability, 0–1. **This metaphor is core to the brand — any redesign must keep it.**

---

## Liquid Glass (`glass.tsx`)

The material, with an honest three-step fallback:

```
isGlassEffectAPIAvailable() true  ->  expo-glass-effect <GlassView>  (real iOS 26 UIGlassEffect)
iOS, API absent                   ->  expo-blur <BlurView>           (pre-26 material)
web / android                     ->  flat View with fallbackColor
```

**Critical gate:** the code checks `isGlassEffectAPIAvailable()` (does `UIGlassEffect` exist at runtime), **not** `isLiquidGlassAvailable()` (merely "runs on iOS 26"). Using the wrong one renders inert glass or crashes (expo/expo#40911). `LIQUID_GLASS` is the exported boolean for "real glass is available."

Components exported: `GlassSurface` (a glass panel), `GlassGroup` (a `GlassContainer` that makes nearby surfaces sample & merge), `GlassFill` (absolute-fill glass for bar backgrounds). **A strong `tint` flattens the refraction — leave tint undefined for true glass.**

Where it's used today: **only the floating tab bar.** `Card` accepts a `glass` prop but almost nothing passes it, so the app is mostly flat surfaces. This is the #1 thing the upgrade should change.

---

## Motion (`motion.tsx`)

Springs, not durations — iOS motion is physical. All three pin `reduceMotion: Never` (see below).

| Spring | damping | stiffness | mass | Use |
|--------|---------|-----------|------|-----|
| `SPRING` | 18 | 240 | 0.7 | Release / settle, with a little life |
| `SPRING_SOFT` | 20 | 150 | 0.9 | Gentle, larger movements |
| `PRESS_IN` | 16 | 420 | 0.5 | Stiff — the press reads instantly |

- **`Press`** — a pressable that springs to `scale 0.94` under the finger (`PRESS_IN` in, `SPRING` out) and fires a light haptic. The standard tappable.
- **`Rise`** — entrance for content: `FadeInDown`, 260ms, `Easing.out(cubic)`, only a **10pt** rise. Deliberately NOT a spring — bouncy card entrances "read as a toy." Stagger by delay.

**Reduce-motion:** Reanimated disables all animation when the OS reports reduce-motion, which once gutted the desktop app silently. So every spring/entering animation pins `ReduceMotion.Never`, and `App.tsx` renders `<ReducedMotionConfig mode={Never} />`. **Keep this** — motion is part of the design, not decoration.

---

## Haptics (`motion.tsx` → `haptics`)

The full vocabulary is wired (via `expo-haptics`), matched to meaning:

| Call | iOS feedback | Intended for |
|------|--------------|--------------|
| `selection()` | UISelection tick | Moving between tabs / segments |
| `light()` `medium()` `heavy()` | UIImpact (3 weights) | Committing an action |
| `rigid()` `soft()` | UIImpact (2 textures) | Sharp vs. cushioned taps |
| `success()` `warning()` `error()` | UINotification | Outcomes |

**The problem isn't the vocabulary — it's the usage.** Today: tabs fire `selection`, the new-note button fires `medium`, saving fires `success`, and `Press` fires `light`. Almost everything else is silent, and there's no *sequenced* or *escalating* haptic anywhere (e.g. the "re-ink on review" moment deserves a crescendo). See the brief.

---

## Layout constants

- `TAB_BAR_HEIGHT = 62`, `FLOAT_GAP = 8`. The tab bar is a **detached 62pt pill** floating `max(safeBottom,12) + 8` above the home indicator, inset 14pt from each edge, with a separate 62pt circular "new note" button. Content scrolls *behind* it.
- `useBottomInset()` gives screens the padding to clear the floating bar: `max(safeBottom,12) + 8 + 62 + 18`.
- Safe-area top is read at runtime (`insets.top`) — 59pt on a 15 Pro Max (Dynamic Island), 20pt elsewhere. Never hardcoded.
