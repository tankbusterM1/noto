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
 * ship without the API and calling into it crashes. It is also unreliable inside
 * Expo Go (expo/expo#39667), which is exactly why this degrades instead of
 * assuming. Don't "simplify" this by importing GlassView at the top level —
 * that breaks the web bundle.
 */
let glassAvailable = false;
type GlassComponent = React.ComponentType<{
  style?: ViewStyle | ViewStyle[];
  glassEffectStyle?: 'clear' | 'regular';
  tintColor?: string;
  isInteractive?: boolean;
  children?: ReactNode;
}>;
let GlassViewImpl: GlassComponent | null = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-glass-effect');
    glassAvailable = typeof mod.isLiquidGlassAvailable === 'function' && mod.isLiquidGlassAvailable();
    GlassViewImpl = mod.GlassView ?? null;
  } catch {
    glassAvailable = false;
  }
}

/** True only when the device can actually render Liquid Glass. */
export const LIQUID_GLASS = glassAvailable && !!GlassViewImpl;

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

/** Absolute-fill glass, for bar backgrounds. */
export function GlassFill({ tint, fallbackColor }: { tint?: string; fallbackColor?: string }) {
  return <GlassSurface style={StyleSheet.absoluteFill as ViewStyle} tint={tint} fallbackColor={fallbackColor} />;
}
