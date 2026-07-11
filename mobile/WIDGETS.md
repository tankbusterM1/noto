# Noto iOS widgets & Live Activities

Home-screen widgets (WidgetKit), lock-screen widgets, and a review Live Activity
(ActivityKit, incl. Dynamic Island). All native SwiftUI, fed from the same vault
the app already syncs. **Everything here is written but must be built on a Mac —
iOS native code cannot compile on Windows/Linux.**

## What's in the repo

| Path | Role |
| --- | --- |
| `targets/widget/` | The Widget Extension (Swift). `@bacons/apple-targets` turns this into an Xcode target at prebuild. |
| `targets/widget/Widgets.swift` | Home + lock-screen widgets (reviews / todos / combined). |
| `targets/widget/LiveActivity.swift` | The review Live Activity + Dynamic Island. |
| `targets/widget/Shared.swift` | App Group reader + the `NotoReviewAttributes` type. |
| `targets/widget/Theme.swift` | Noto's palette + serif/mono in SwiftUI. |
| `modules/noto-widgets/` | A local Expo module — the JS↔Swift bridge that writes data, reloads timelines, and starts/updates/ends the Live Activity. |
| `src/widgetSync.ts` | Builds the snapshot from the store and drives the Live Activity. Wired in `App.tsx` (boot) and `screens/Review.tsx` (session). |

Data flow: `store → widgetSync.ts → noto-widgets module → App Group (UserDefaults) → WidgetKit`. The widgets read a JSON `NotoSnapshot`; the Live Activity is pushed live during a review.

## The SDK

**No upgrade needed.** You're on Expo SDK 54, which is current. Live Activities
and widgets are gated by the *native extension*, not the SDK version. (One pin
was added — `@expo/prebuild-config@54.0.8` as a devDependency — because
`@bacons/apple-targets` resolves it from the top level and SDK 54 nests it.)

## One-time setup (on a Mac)

1. **Add your Apple Team ID** to `app.json` — the config warns until you do:
   ```json
   "ios": { "appleTeamId": "XXXXXXXXXX", ... }
   ```
   Find it in Xcode ▸ Settings ▸ Accounts, or at developer.apple.com ▸ Membership.

2. **App Group** — the app and widget share `group.com.noto.vault` (already in
   `app.json` and `expo-target.config.js`). Xcode's automatic signing will create
   it; or add it once in the Apple Developer portal under Identifiers.

## Build

```bash
cd mobile
npm install
npx expo prebuild -p ios --clean     # generates ios/ with the widget target + module
npx pod-install                       # or: cd ios && pod install
npx expo run:ios                      # or open ios/*.xcworkspace in Xcode, or EAS build
```

Expo Go can't run this (native code) — use a dev build or `expo run:ios`.

## Requirements & testing

- **iOS 16.1+** for Live Activities. **Dynamic Island** needs iPhone 14 Pro or
  newer; other phones show the lock-screen Live Activity instead.
- Widgets: long-press the home screen ▸ **+** ▸ search "Noto" ▸ add *Reviews due*,
  *Todos*, or *Day at a glance*. Lock screen: Customize ▸ add the Noto accessory.
- Live Activity: start a review (Review tab). The count, quote, and bar update as
  you grade; it ends when the queue drains or you leave.

## Known gaps

- **Streak is stubbed to 0** in `widgetSync.ts` (`buildSnapshot`) — wire it to a
  real review streak from the ledger when you want the real number.
- **Fonts**: widgets use the system serif (New York) as a stand-in for Newsreader
  to avoid bundling the font into the extension. To use the real face, add the
  `.otf` files to the widget target and reference them in `Theme.swift`.
- `NotoReviewAttributes` is duplicated in `targets/widget/Shared.swift` and
  `modules/noto-widgets/ios/NotoReviewAttributes.swift` — they **must stay
  identical** (ActivityKit matches the activity across app + extension by type).
