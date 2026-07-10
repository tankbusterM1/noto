import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

/*
 * Liquid Glass (Apple's iOS 26 material), with an honest fallback chain.
 *
 *   iOS 26 + API present  ->  expo-glass-effect GlassView (real UIGlassEffect)
 *   iOS < 26              ->  expo-blur BlurView (the pre-26 material)
 *   web / android         ->  flat surface
 *
 * `isLiquidGlassAvailable()` is a RUNTIME check on purpose: some iOS 26 betas
 * ship without the API and calling into it crashes. Don't hoist the import to
 * the top level — that breaks the web bundle.
 *
 * `isInteractive` is the touch-reactive glass ("hover"). Per Expo's docs it can
 * only be set ONCE on mount, so it must be a static prop, never toggled.
 */
type GlassProps = {
  style?: ViewStyle | ViewStyle[];
  glassEffectStyle?: 'clear' | 'regular';
  tintColor?: string;
  isInteractive?: boolean;
  children?: ReactNode;
};

let GlassViewImpl: React.ComponentType<GlassProps> | null = null;
let liquidAvailable = false;
let apiAvailable = false;
let loadError: string | null = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-glass-effect');
    apiAvailable = typeof mod.isGlassEffectAPIAvailable === 'function' ? !!mod.isGlassEffectAPIAvailable() : false;
    liquidAvailable = typeof mod.isLiquidGlassAvailable === 'function' ? !!mod.isLiquidGlassAvailable() : false;
    GlassViewImpl = mod.GlassView ?? null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'require failed';
  }
}

/** True only when the device can actually render Liquid Glass. */
export const LIQUID_GLASS = liquidAvailable && !!GlassViewImpl;

/** Why glass is or isn't on — surfaced in Settings so nobody has to guess. */
export function glassDiagnostics() {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    moduleLoaded: !!GlassViewImpl,
    apiAvailable,
    liquidAvailable,
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
}: {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  tint?: string;
  interactive?: boolean;
  intensity?: number;
  fallbackColor?: string;
}) {
  if (LIQUID_GLASS && GlassViewImpl) {
    const G = GlassViewImpl;
    return (
      <G style={style} glassEffectStyle="regular" tintColor={tint} isInteractive={interactive}>
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

/** Absolute-fill glass, for bar backgrounds. `interactive` gives the touch-reactive material. */
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
