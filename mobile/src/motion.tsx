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
 * Haptics, matched to meaning rather than one buzz for everything:
 *   selection -> moving between tabs (the crisp UIKit tick)
 *   impact    -> committing something (new note, grading)
 *   notify    -> an outcome (review recorded, destructive action)
 */
const safe = (p: Promise<void>) => void p.catch(() => {});

export const haptics = {
  selection: () => (Platform.OS === 'web' ? undefined : safe(Haptics.selectionAsync())),
  light: () => (Platform.OS === 'web' ? undefined : safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))),
  medium: () => (Platform.OS === 'web' ? undefined : safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))),
  heavy: () => (Platform.OS === 'web' ? undefined : safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy))),
  rigid: () => (Platform.OS === 'web' ? undefined : safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid))),
  soft: () => (Platform.OS === 'web' ? undefined : safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft))),
  success: () => (Platform.OS === 'web' ? undefined : safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))),
  warning: () => (Platform.OS === 'web' ? undefined : safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))),
  error: () => (Platform.OS === 'web' ? undefined : safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))),
};

export function tapFeedback(strength: 'light' | 'medium' = 'light') {
  if (strength === 'light') haptics.light();
  else haptics.medium();
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
