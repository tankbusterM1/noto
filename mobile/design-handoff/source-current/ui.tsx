import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface, LIQUID_GLASS } from './glass';
import { c, radius, serif, mono, t, TAB_BAR_HEIGHT, FLOAT_GAP } from './theme';

/**
 * Safe-area aware screen container.
 *
 * `insets.top` is read at runtime rather than hardcoded: on an iPhone 15 Pro Max
 * it resolves to 59pt (the Dynamic Island), on a non-notched device to 20pt.
 * Hardcoding 59 would break every other phone.
 */
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.screen, { paddingTop: insets.top }, style]}>{children}</View>;
}

/** Bottom padding so content clears the floating pill + its gap + the home indicator. */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + FLOAT_GAP + TAB_BAR_HEIGHT + 18;
}

export function LargeTitle({ kicker, title, trailing }: { kicker?: string; title: string; trailing?: ReactNode }) {
  return (
    <View style={s.titleWrap}>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={s.kicker}>{kicker.toUpperCase()}</Text> : null}
        <Text style={s.large} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

/** `glass` opts into Liquid Glass where it's genuinely available; else a flat card. */
export function Card({ children, style, glass }: { children: ReactNode; style?: ViewStyle; glass?: boolean }) {
  if (glass && LIQUID_GLASS) {
    return (
      <GlassSurface style={[s.card, { backgroundColor: 'transparent' }, style] as ViewStyle[]}>
        {children}
      </GlassSurface>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Pill({ label, tone = 'ink' }: { label: string; tone?: 'ink' | 'amber' | 'green' }) {
  const color = tone === 'amber' ? c.amber : tone === 'green' ? c.green : c.ink3;
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Tappable({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.62 }]}>
      {children}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  kicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.8, color: c.ink3 },
  large: { ...t.largeTitle, fontFamily: serif, color: c.ink, marginTop: 4 },
  card: {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 16,
    overflow: 'hidden',
  },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  pillText: { ...t.caption2, fontFamily: mono },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  muted: { ...t.subhead, color: c.ink2, lineHeight: 21 },
  mono: { fontFamily: mono },
});
