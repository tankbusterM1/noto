# Noto iOS — Designer Handoff

This folder is a **complete, self-contained snapshot of the Noto iOS app as it exists today**, packaged so a design tool (or a designer) can understand exactly what is built, then propose an upgrade that drops straight back into the codebase.

It contains the **real code**, not a mockup. Every value in the spec below is copied from the source, and the source itself is in [`source-current/`](source-current/).

---

## What Noto is

A local-first notes app with **note-level spaced repetition** (FSRS). You write notes; each note has a memory strength that decays over time and is re-inked when you review it. There's an encrypted journal, todos, watch-later, and GitHub-backed sync between an iPhone and a desktop PWA.

The iOS app is **React Native + Expo (SDK 54)**, sideloaded as an unsigned IPA. It follows Apple's iOS 26 structure (floating Liquid Glass tab bar, large titles, Dynamic Island safe areas) but keeps Noto's own voice: **paper and ink, Newsreader serif, JetBrains Mono, an amber accent.**

The brand mark ([`assets/icon.png`](assets/icon.png)): a cream geometric **N** on near-black ink, with an **amber dot** at the foot of the N's right leg — the period in "Noto." That amber is the exact color a note glows when it's due for review.

---

## What this handoff is for

Three things feel unfinished, and this package exists to fix them:

1. **The Liquid Glass doesn't read as glass.** It's wired correctly but used timidly — flat cards, one glassy element (the tab bar), no depth or reactivity.
2. **The haptics are weak.** The vocabulary exists but few moments use it, and the ones that do are the lightest tap.
3. **There's no launch animation.** A static splash image, then a text spinner. No branded moment.

The full brief, with hard constraints and a do-not-touch list, is in **[`UPGRADE-BRIEF.md`](UPGRADE-BRIEF.md)** — read that before changing anything.

---

## How to use this folder

1. Read the four spec docs, in order:
   - **[`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)** — every token: color, type, spacing, radius, glass, motion, haptics.
   - **[`SCREENS.md`](SCREENS.md)** — every screen, described, with its real file.
   - **[`COMPONENTS.md`](COMPONENTS.md)** — the shared components and their props.
   - **[`UPGRADE-BRIEF.md`](UPGRADE-BRIEF.md)** — what to change, what not to, and the format to return.
2. The exact current code is in **[`source-current/`](source-current/)** — treat it as the source of truth over any prose here.
3. Return changed/new files in the shape described at the end of `UPGRADE-BRIEF.md`, and they get pasted back into `mobile/`.

---

## The one rule

**This is a design upgrade, not a rewrite.** The data model, the crypto, and the GitHub sync engine are proven and off-limits (see `UPGRADE-BRIEF.md` → "Do not touch"). Change how it *looks and feels*; never change what it *stores or syncs*.
