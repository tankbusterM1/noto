import type { ReactNode } from 'react';
import { Platform, Pressable, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';

/*
 * Motion.
 *
 * Deliberately NO reduce-motion kill switch. On the desktop app a blanket
 * `prefers-reduced-motion` rule silently deleted every micro-animation and the
 * app looked dead; we are not repeating that.
 *
 * Reanimated ships that exact kill switch ON BY DEFAULT: when the OS reports
 * reduce-motion it disables animations and only warns in dev. So every spring
 * and every layout animation here pins `ReduceMotion.Never`, and App renders a
 * <ReducedMotionConfig mode={Never}> at the root. If motion ever needs reducing
 * it becomes an explicit in-app toggle, not an ambient one.
 *
 * Springs, not durations — iOS motion is physical. `PRESS_IN` is stiff so the
 * press reads instantly; `SPRING` settles with a little life on release.
 */
const NEVER = ReduceMotion.Never;

export const SPRING: WithSpringConfig = { damping: 18, stiffness: 240, mass: 0.7, reduceMotion: NEVER };
export const SPRING_SOFT: WithSpringConfig = { damping: 20, stiffness: 150, mass: 0.9, reduceMotion: NEVER };
export const PRESS_IN: WithSpringConfig = { damping: 16, stiffness: 420, mass: 0.5, reduceMotion: NEVER };

/*
 * Haptics.
 *
 * The single-buzz version felt weak because almost everything used the lightest
 * impact and nothing was *choreographed*. Premium iOS apps layer taps into short
 * patterns — a landing has a thud, a success has a bounce, a big moment builds.
 *
 * Two layers here: `fire()` is the atom map onto UIKit's feedback generators;
 * `seq()` chains atoms a few milliseconds apart into a felt gesture. The named
 * verbs below are what the app actually calls, so intent lives at the call site.
 */
const safe = (p: Promise<void>) => void p.catch(() => {});

type Atom = 'selection' | 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'success' | 'warning' | 'error';

function fire(a: Atom) {
  if (Platform.OS === 'web') return;
  switch (a) {
    case 'selection':
      return safe(Haptics.selectionAsync());
    case 'success':
      return safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    case 'warning':
      return safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    case 'error':
      return safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    default: {
      const style = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
        rigid: Haptics.ImpactFeedbackStyle.Rigid,
        soft: Haptics.ImpactFeedbackStyle.Soft,
      }[a];
      return safe(Haptics.impactAsync(style));
    }
  }
}

/** Fire a pattern: [atom, ms-since-previous]. The first delay is from now. */
function seq(steps: Array<[Atom, number]>) {
  if (Platform.OS === 'web') return;
  let t = 0;
  for (const [atom, gap] of steps) {
    t += gap;
    if (t === 0) fire(atom);
    else setTimeout(() => fire(atom), t);
  }
}

export const haptics = {
  // Atoms — kept for existing call sites and precise control.
  selection: () => fire('selection'),
  light: () => fire('light'),
  medium: () => fire('medium'),
  heavy: () => fire('heavy'),
  rigid: () => fire('rigid'),
  soft: () => fire('soft'),
  success: () => fire('success'),
  warning: () => fire('warning'),
  error: () => fire('error'),

  // Verbs — the choreographed feels the app uses.
  /** A crisp press. Rigid reads sharper than Light — this is the new default tap. */
  tap: () => fire('rigid'),
  /** Moving between tabs / segments — the true UIKit tick. */
  tick: () => fire('selection'),
  /** A weighty commit: new note, add. Two beats so it lands, not just clicks. */
  commit: () => seq([['heavy', 0], ['rigid', 45]]),
  /** A satisfying confirmation: a knock, then the system success chord. */
  confirm: () => seq([['rigid', 0], ['success', 55]]),
  /** The signature review "re-ink" — a short crescendo, light into heavy. */
  reink: () => seq([['light', 0], ['medium', 70], ['heavy', 150]]),
  /** Something landing — a soft cushion under a hard tap. */
  drop: () => seq([['soft', 0], ['heavy', 0]]),
  /** A gentle-but-clear "careful": warning chord after a rigid knock. */
  warn: () => seq([['rigid', 0], ['warning', 60]]),
  /** A refusal / failure: a heavy double into the error chord. */
  fail: () => seq([['heavy', 0], ['heavy', 70], ['error', 60]]),
};

export function tapFeedback(strength: 'light' | 'medium' = 'light') {
  // "light" is the default button press — now a crisp rigid rather than the
  // faint Light impact, which is what made the app feel unresponsive.
  if (strength === 'light') fire('rigid');
  else fire('heavy');
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A pressable that springs under the finger, the way UIKit controls do. */
export function Press({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = 0.94,
  haptic = true,
  disabled = false,
  accessibilityLabel,
  accessibilityRole,
  hitSlop,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  scaleTo?: number;
  haptic?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab';
  hitSlop?: number;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPressIn={() => {
        s.value = withSpring(scaleTo, PRESS_IN);
      }}
      onPressOut={() => {
        s.value = withSpring(1, SPRING);
      }}
      onPress={() => {
        if (haptic) tapFeedback();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[style as ViewStyle, a]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Content that settles into place. Deliberately NOT a spring: a bouncy entrance
 * on every card reads as a toy. This is a short ease-out over a 10pt rise —
 * FadeInDown's 25pt default travel plus `.springify()` was the jiggle.
 */
export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(260)
        .easing(Easing.out(Easing.cubic))
        .withInitialValues({ transform: [{ translateY: 10 }] })
        .reduceMotion(NEVER)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
