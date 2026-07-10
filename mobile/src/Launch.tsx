import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { c } from './theme';
import { haptics } from './motion';

/*
 * The launch animation — from the Claude Design file "Noto Launch & Glass".
 *
 * The brand mark (a cream N + amber dot) is revealed through a frosted glass
 * pane that sheens and dissolves; the dot drops and bounces; then the whole
 * splash LIFTS up and off to uncover the app that has mounted beneath it.
 *
 * It is wired to the REAL boot, not a fixed timer: it plays its intro, then
 * holds on the settled mark until `canLift` (fonts loaded + vault hydrated) is
 * true, and only then lifts away — so a slow open never cuts the app off mid-
 * mount, and a fast one still gets the full branded beat.
 *
 * Every animation pins ReduceMotion.Never — motion is the design here, and the
 * app opts out of the OS reduce-motion kill switch globally (see App.tsx).
 */
const NEVER = ReduceMotion.Never;

// Beats in ms (design spec, launchSpeed = 1).
const PANE_IN = 40;
const EMERGE = 280;
const DISSOLVE = 1080;
const DOT = 1240;
const LAND = 1540;
const SETTLE = 1830;
const LIFT_MS = 780;

// The composition tile and the N holder inside it (design geometry).
const COMP = 188;
const HOLD_W = 118;
const HOLD_H = 100;
const N_W = 96;
const N_H = 81;
const DOT_D = 22;

/** The app-icon N: two vertical bars joined by the diagonal. viewBox 118×100. */
const N_PATH = 'M0 0 H26 V100 H0 Z M92 0 H118 V100 H92 Z M0 0 L26 0 L118 100 L92 100 Z';

export function Launch({ canLift, onDone }: { canLift: boolean; onDone: () => void }) {
  const { height } = useWindowDimensions();
  const mountedAt = useRef(Date.now());
  const [lifting, setLifting] = useState(false);

  // The frosted pane over the mark.
  const paneOpacity = useSharedValue(0);
  const paneScale = useSharedValue(1.04);
  const sheen = useSharedValue(0); // 0..1 sweep across the pane

  // The N mark.
  const nOpacity = useSharedValue(0.12);
  const nScale = useSharedValue(0.97);

  // The amber dot.
  const dotY = useSharedValue(-120);
  const dotOpacity = useSharedValue(0);
  const dotBreathe = useSharedValue(1);

  // The land beat: a squash on the whole tile + a ripple from the dot.
  const compScale = useSharedValue(1);
  const rippleScale = useSharedValue(0.4);
  const rippleOpacity = useSharedValue(0);

  // The lift-off.
  const overlayY = useSharedValue(0);

  // ── the intro, scheduled once on mount ──────────────────────────────
  useEffect(() => {
    // Pane: fade+scale in at 40ms, hold, then dissolve out (scale up) at 1080ms.
    paneOpacity.value = withSequence(
      withDelay(PANE_IN, withTiming(1, { duration: 460, easing: Easing.out(Easing.ease), reduceMotion: NEVER })),
      withDelay(DISSOLVE - (PANE_IN + 460), withTiming(0, { duration: 460, easing: Easing.out(Easing.ease), reduceMotion: NEVER })),
    );
    paneScale.value = withSequence(
      withDelay(PANE_IN, withTiming(1, { duration: 460, easing: Easing.bezier(0.3, 0.6, 0.2, 1), reduceMotion: NEVER })),
      withDelay(DISSOLVE - (PANE_IN + 460), withTiming(1.1, { duration: 460, easing: Easing.bezier(0.3, 0.6, 0.2, 1), reduceMotion: NEVER })),
    );
    sheen.value = withDelay(PANE_IN, withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease), reduceMotion: NEVER }));

    // N: sharpen (deblur is faked with opacity+scale — RN has no per-view blur).
    nOpacity.value = withDelay(EMERGE, withTiming(1, { duration: 780, easing: Easing.bezier(0.22, 0.6, 0.2, 1), reduceMotion: NEVER }));
    nScale.value = withDelay(EMERGE, withTiming(1, { duration: 780, easing: Easing.bezier(0.22, 0.6, 0.2, 1), reduceMotion: NEVER }));

    // Dot: drop from above and bounce like a ball landing (the CSS linear() bounce).
    dotOpacity.value = withDelay(DOT, withTiming(1, { duration: 90, easing: Easing.linear, reduceMotion: NEVER }));
    dotY.value = withDelay(
      DOT,
      withSequence(
        withTiming(0, { duration: 290, easing: Easing.in(Easing.cubic), reduceMotion: NEVER }), // first landing ≈ LAND beat
        withTiming(-22, { duration: 120, easing: Easing.out(Easing.quad), reduceMotion: NEVER }),
        withTiming(0, { duration: 130, easing: Easing.in(Easing.quad), reduceMotion: NEVER }),
        withTiming(-7, { duration: 90, easing: Easing.out(Easing.quad), reduceMotion: NEVER }),
        withTiming(0, { duration: 80, easing: Easing.in(Easing.quad), reduceMotion: NEVER }),
      ),
    );

    // Land: a small squash on the tile, and a ring rippling out from the dot.
    compScale.value = withDelay(
      LAND,
      withSequence(
        withTiming(0.984, { duration: 112, easing: Easing.out(Easing.ease), reduceMotion: NEVER }),
        withTiming(1, { duration: 208, easing: Easing.out(Easing.ease), reduceMotion: NEVER }),
      ),
    );
    rippleOpacity.value = withDelay(
      LAND,
      withSequence(
        withTiming(0.55, { duration: 0, reduceMotion: NEVER }),
        withTiming(0, { duration: 760, easing: Easing.out(Easing.ease), reduceMotion: NEVER }),
      ),
    );
    rippleScale.value = withDelay(
      LAND,
      withSequence(
        withTiming(0.4, { duration: 0, reduceMotion: NEVER }),
        withTiming(2.5, { duration: 760, easing: Easing.out(Easing.ease), reduceMotion: NEVER }),
      ),
    );

    // After it settles, the dot breathes gently — so a slow boot never looks frozen.
    dotBreathe.value = withDelay(
      SETTLE,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1150, easing: Easing.inOut(Easing.ease), reduceMotion: NEVER }),
          withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.ease), reduceMotion: NEVER }),
        ),
        -1,
        false,
      ),
    );

    // The land haptic, timed to the dot's first touch.
    const medium = setTimeout(() => haptics.medium(), LAND);
    return () => clearTimeout(medium);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the lift-off, gated on the real boot finishing ──────────────────
  useEffect(() => {
    if (!canLift) return;
    // Never lift before the mark has settled; if boot was slow, lift at once.
    const wait = Math.max(0, SETTLE - (Date.now() - mountedAt.current));
    const id = setTimeout(() => {
      cancelAnimation(dotBreathe);
      dotBreathe.value = 1;
      setLifting(true);
      haptics.soft();
      overlayY.value = withTiming(
        -height * 1.03,
        { duration: LIFT_MS, easing: Easing.bezier(0.66, 0, 0.18, 1), reduceMotion: NEVER },
        (finished) => {
          if (finished) runOnJS(onDone)();
        },
      );
    }, wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLift]);

  // ── styles ──────────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: overlayY.value }] }));
  const compStyle = useAnimatedStyle(() => ({ transform: [{ scale: compScale.value }] }));
  const paneStyle = useAnimatedStyle(() => ({ opacity: paneOpacity.value, transform: [{ scale: paneScale.value }] }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-150, 210]) }, { rotate: '14deg' }],
  }));
  const nStyle = useAnimatedStyle(() => ({ opacity: nOpacity.value, transform: [{ scale: nScale.value }] }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ translateY: dotY.value }, { scale: dotBreathe.value }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({ opacity: rippleOpacity.value, transform: [{ scale: rippleScale.value }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.overlay, overlayStyle]} pointerEvents={lifting ? 'none' : 'auto'}>
      <View style={[st.stage, { transform: [{ translateY: -height * 0.055 }] }]}>
        <Animated.View style={[st.comp, compStyle]}>
          {/* the mark */}
          <View style={st.holder}>
            <Animated.View style={[st.n, nStyle]}>
              <Svg width={N_W} height={N_H} viewBox="0 0 118 100">
                <Path d={N_PATH} fill={c.ink} />
              </Svg>
            </Animated.View>
            <Animated.View style={[st.ripple, rippleStyle]} />
            <Animated.View style={[st.dot, dotStyle]} />
          </View>

          {/* the frosted glass pane, above the mark, with a single sheen sweep */}
          <Animated.View style={[st.pane, paneStyle]} pointerEvents="none">
            <View style={st.paneHighlight} pointerEvents="none" />
            <Animated.View style={[st.sheen, sheenStyle]} pointerEvents="none" />
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  overlay: {
    backgroundColor: c.bg,
    zIndex: 10,
    // Shadow so the lifting panel reads as a physical layer over the app.
    shadowColor: '#18130a',
    shadowOpacity: 0.35,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  comp: { width: COMP, height: COMP, alignItems: 'center', justifyContent: 'center' },
  holder: { width: HOLD_W, height: HOLD_H },
  n: { position: 'absolute', left: 0, top: 6 },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: DOT_D,
    height: DOT_D,
    borderRadius: DOT_D / 2,
    backgroundColor: c.amber,
    shadowColor: c.amber,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  ripple: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: DOT_D,
    height: DOT_D,
    borderRadius: DOT_D / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(184,122,38,0.6)',
  },
  pane: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: 'rgba(250,248,242,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  // Faked "inset top highlight" — RN has no inset shadow.
  paneHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  sheen: {
    position: 'absolute',
    top: -50,
    bottom: -50,
    width: 76,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
