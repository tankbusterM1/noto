import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

/*
 * Liquid Glass (Apple's iOS 26 material), with an honest fallback chain.
 *
 *   glass effect API present  ->  expo-glass-effect GlassView (real UIGlassEffect)
 *   iOS without it            ->  expo-blur BlurView (the pre-26 material)
 *   web / android             ->  flat surface
 *
 * THE GATE IS `isGlassEffectAPIAvailable()`, NOT `isLiquidGlassAvailable()`.
 * They are not the same thing, and using the wrong one renders an inert (or
 * crashing) GlassView:
 *
 *   · isLiquidGlassAvailable()    -> "this app adopts the Liquid Glass design".
 *     True merely because the app runs on iOS 26. Says nothing about the API.
 *   · isGlassEffectAPIAvailable() -> "UIGlassEffect actually exists at runtime".
 *     Expo's own docs say to check THIS before rendering GlassView, because some
 *     iOS 26 builds lack it and crash (expo/expo#40911).
 *
 * A binary compiled against a pre-iOS-26 SDK — which is what Expo Go currently
 * is — reports design=true, api=false. That combination is precisely the trap.
 *
 * Don't hoist the import to the top level: it breaks the web bundle.
 */
type GlassStyle = 'clear' | 'regular' | 'none';

type GlassProps = {
  style?: ViewStyle | ViewStyle[];
  glassEffectStyle?: GlassStyle;
  tintColor?: string;
  isInteractive?: boolean;
  colorScheme?: 'auto' | 'light' | 'dark';
  children?: ReactNode;
};

let GlassViewImpl: React.ComponentType<GlassProps> | null = null;
let GlassContainerImpl: React.ComponentType<{
  spacing?: number;
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
}> | null = null;
let designAdopted = false;
let effectApi = false;
let loadError: string | null = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-glass-effect');
    designAdopted = typeof mod.isLiquidGlassAvailable === 'function' ? !!mod.isLiquidGlassAvailable() : false;
    effectApi = typeof mod.isGlassEffectAPIAvailable === 'function' ? !!mod.isGlassEffectAPIAvailable() : false;
    GlassViewImpl = mod.GlassView ?? null;
    GlassContainerImpl = mod.GlassContainer ?? null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'require failed';
  }
}

/** Only true when UIGlassEffect can genuinely render. */
export const LIQUID_GLASS = effectApi && !!GlassViewImpl;

export function glassDiagnostics() {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    moduleLoaded: !!GlassViewImpl,
    designAdopted,
    effectApi,
    active: LIQUID_GLASS,
    loadError,
  };
}

export function GlassSurface({
  children,
  style,
  tint,
  interactive = false,
  intensity = 60,
  fallbackColor,
  effectStyle = 'regular',
}: {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Leave undefined for true glass — a strong tint flattens the refraction. */
  tint?: string;
  interactive?: boolean;
  intensity?: number;
  fallbackColor?: string;
  effectStyle?: GlassStyle;
}) {
  if (LIQUID_GLASS && GlassViewImpl) {
    const G = GlassViewImpl;
    return (
      <G
        style={style}
        glassEffectStyle={effectStyle}
        tintColor={tint}
        isInteractive={interactive}
        colorScheme="light"
      >
        {children}
      </G>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint="light" style={style}>
        {children}
      </BlurView>
    );
  }

  return <View style={[style, fallbackColor ? { backgroundColor: fallbackColor } : null]}>{children}</View>;
}

/**
 * Groups nearby glass surfaces so they SAMPLE and MERGE like one fluid body —
 * the Liquid Glass signature (a circular button "kissing" the pill next to it).
 * Real GlassContainer when the effect API exists; otherwise a plain row.
 */
export function GlassGroup({
  children,
  style,
  spacing = 20,
}: {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  spacing?: number;
}) {
  if (LIQUID_GLASS && GlassContainerImpl) {
    const GC = GlassContainerImpl;
    return (
      <GC spacing={spacing} style={style}>
        {children}
      </GC>
    );
  }
  return <View style={style}>{children}</View>;
}

/** Absolute-fill glass, for bar backgrounds. `interactive` = touch-reactive material. */
export function GlassFill({
  tint,
  fallbackColor,
  interactive = false,
}: {
  tint?: string;
  fallbackColor?: string;
  interactive?: boolean;
}) {
  return (
    <GlassSurface
      style={StyleSheet.absoluteFill as ViewStyle}
      tint={tint}
      interactive={interactive}
      fallbackColor={fallbackColor}
    />
  );
}
