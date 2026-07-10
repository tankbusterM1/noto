# Shared components

The building blocks every screen uses. Real code: [`source-current/ui.tsx`](source-current/ui.tsx), [`source-current/glass.tsx`](source-current/glass.tsx), [`source-current/motion.tsx`](source-current/motion.tsx), [`source-current/FloatingTabBar.tsx`](source-current/FloatingTabBar.tsx).

## From `ui.tsx`

| Component | Props | What it is |
|-----------|-------|------------|
| `Screen` | `children, style` | Safe-area container. Pads `insets.top` (Dynamic Island aware). Paper bg. |
| `useBottomInset()` | → number | Bottom padding so scroll content clears the floating tab bar. |
| `LargeTitle` | `kicker?, title, trailing?` | The iOS large-title header: mono uppercase kicker + Newsreader 34pt title + optional trailing control. |
| `Card` | `children, style, glass?` | The surface primitive. Flat `surface` card by default; real glass **only if** `glass` AND `LIQUID_GLASS`. |
| `Pill` | `label, tone` | Small mono capsule outline. tones: `ink · amber · green`. |
| `Tappable` | `children, onPress, style` | Opacity-dim pressable (0.62 when pressed). |

## From `motion.tsx`

| Export | What it is |
|--------|------------|
| `Press` | Spring-scale pressable (0.94) + light haptic. The standard button wrapper. |
| `Rise` | `FadeInDown` entrance, 260ms, 10pt rise, `Easing.out(cubic)`. Stagger by `delay`. |
| `haptics` | `{ selection, light, medium, heavy, rigid, soft, success, warning, error }`. |
| `SPRING`, `SPRING_SOFT`, `PRESS_IN` | The three spring configs (see DESIGN-SYSTEM). |

## From `glass.tsx`

| Export | What it is |
|--------|------------|
| `GlassSurface` | A glass panel. Props: `style, tint?, interactive?, intensity?, fallbackColor?, effectStyle?`. Leave `tint` undefined for true refraction. |
| `GlassGroup` | Wraps sibling glass surfaces so they sample & merge (`GlassContainer`). Prop: `spacing`. |
| `GlassFill` | Absolute-fill glass for bar backgrounds. |
| `LIQUID_GLASS` | Boolean — is real iOS 26 glass available right now. |
| `glassDiagnostics()` | Debug read-out (surfaced in Settings). |

## Installed libraries you may design with

These are already dependencies — **use these, don't reach for anything else** (a new native module means a fresh IPA build and possible incompatibility — flag it explicitly if you truly need one).

```
expo                     ^54.0.35     (SDK 54 — do not assume 55+ APIs)
react-native             0.81.5
react-native-reanimated  ~4.1.1       (worklets on the UI thread; pin ReduceMotion.Never)
react-native-worklets    0.5.1
react-native-svg         15.12.1      (vector — good for the launch animation / brand N)
expo-blur                ~15.0.8
expo-glass-effect        ~0.1.10      (the iOS 26 glass; gate on isGlassEffectAPIAvailable)
expo-haptics             ~15.0.8
expo-font                ~14.0.12     (Newsreader + JetBrains Mono already loaded)
@expo/vector-icons       ^15.0.2      (Ionicons in use)
```

**Not installed** (avoid, or flag if essential): `expo-linear-gradient`, `expo-image`, `expo-symbols`, `react-native-gesture-handler`, `react-native-skia`. A gradient can be faked with stacked `View`s or an SVG; SF Symbols aren't available, use Ionicons.
