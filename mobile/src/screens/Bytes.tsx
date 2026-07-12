import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serif, serifItalic, t } from '../theme';
import { haptics } from '../motion';
import { Screen } from '../ui';
import { useData } from '../store';
import { bytesDeck, dates } from '../../core';
import type { TodayStackParamList } from '../navTypes';

const NEVER = ReduceMotion.Never;
const SPRING = { damping: 20, stiffness: 200, mass: 0.7, reduceMotion: NEVER };
const SWIPE = 90; // px past which a drag becomes an advance

const ACCENT: Record<string, string> = { ml: c.amber, ai: c.amber, sql: c.green, python: c.accent, algo: c.red, stats: c.accent, cs: c.ink2 };
const accentOf = (topic: string) => ACCENT[topic] ?? c.amber;

type Props = NativeStackScreenProps<TodayStackParamList, 'Bytes'>;

export function BytesScreen({ navigation }: Props) {
  const bytes = useData((s) => s.bytes);
  const byteState = useData((s) => s.byteState);
  const markByteSeen = useData((s) => s.markByteSeen);
  const keepByte = useData((s) => s.keepByte);
  const { height: H } = useWindowDimensions();

  // Snapshot cards + seen/kept at mount, so marking a card seen mid-scroll never
  // reshuffles the deck. Only the tag filter rebuilds it (day-seeded, so stable).
  const bytesSnap = useRef(bytes).current;
  const stateSnap = useRef(byteState).current;
  const [filter, setFilter] = useState<string | null>(null);
  const topics = useMemo(() => [...new Set(bytesSnap.map((b) => b.topic))].sort(), [bytesSnap]);
  const deck = useMemo(() => {
    const pool = filter ? bytesSnap.filter((b) => b.topic === filter) : bytesSnap;
    return bytesDeck.buildDeck(pool, stateSnap, dates.todayEpochDay(), 20);
  }, [filter, bytesSnap, stateSnap]);

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const setIdx = (i: number) => {
    indexRef.current = i;
    setIndex(i);
  };

  const current = index < deck.length ? deck[index] : null;

  // Mark each shown card seen (drives tomorrow's scheduling).
  useEffect(() => {
    if (current) void markByteSeen(current.id);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── animation state ──────────────────────────────────────────────────
  const y = useSharedValue(0); // vertical drag / fling of the current card
  const keepGlow = useSharedValue(0); // 0..1 amber flash on Keep
  const keepScale = useSharedValue(1);
  const busy = useRef(false);

  const land = (delta: number) => {
    const ni = Math.max(0, Math.min(indexRef.current + delta, deck.length));
    setIdx(ni);
    y.value = delta > 0 ? H : -H; // new card enters from the opposite edge
    y.value = withSpring(0, SPRING, () => {
      busy.current = false;
    });
    haptics.tick();
  };

  const fling = (delta: number) => {
    // Guard the ends: no next past the finish card, no prev before the first.
    const ni = indexRef.current + delta;
    if (ni < 0 || ni > deck.length) {
      y.value = withSpring(0, SPRING);
      return;
    }
    busy.current = true;
    const off = delta > 0 ? -H : H; // advancing flings the current card up
    y.value = withTiming(off, { duration: 220, easing: Easing.bezier(0.5, 0, 0.2, 1), reduceMotion: NEVER }, (fin) => {
      if (fin) runOnJS(land)(delta);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (busy.current) return;
        // A touch of resistance so it feels weighted, not slippery.
        y.value = g.dy * 0.85;
      },
      onPanResponderRelease: (_e, g) => {
        if (busy.current) return;
        if (g.dy < -SWIPE) fling(1);
        else if (g.dy > SWIPE) fling(-1);
        else y.value = withSpring(0, SPRING);
      },
    }),
  ).current;

  const keep = () => {
    if (!current || busy.current) return;
    haptics.confirm();
    keepGlow.value = withSequence(withTiming(1, { duration: 120, reduceMotion: NEVER }), withTiming(0, { duration: 520, reduceMotion: NEVER }));
    keepScale.value = withSequence(withSpring(0.96, { ...SPRING, stiffness: 320 }), withSpring(1, SPRING));
    void keepByte(current);
    // Let the pulse land, then flow to the next card.
    busy.current = true;
    setTimeout(() => {
      busy.current = false;
      fling(1);
    }, 340);
  };

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: keepScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: keepGlow.value * 0.5 }));

  const pickTopic = (tp: string | null) => {
    if (busy.current || tp === filter) return;
    y.value = 0;
    keepGlow.value = 0;
    setIdx(0);
    setFilter(tp);
    haptics.tick();
  };

  const chipsRow =
    topics.length > 1 ? (
      <View style={st.chips}>
        <Pressable style={[st.chip, filter === null && st.chipOn]} onPress={() => pickTopic(null)}>
          <Text style={[st.chipText, filter === null && st.chipTextOn]}>all</Text>
        </Pressable>
        {topics.map((tp) => (
          <Pressable key={tp} style={[st.chip, filter === tp && st.chipOn]} onPress={() => pickTopic(tp)}>
            <Text style={[st.chipText, filter === tp && st.chipTextOn]}>{tp}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const progress = deck.length ? Math.min(index, deck.length) / deck.length : 0;

  // ── empty / finished states ──────────────────────────────────────────
  if (deck.length === 0) {
    return (
      <Screen>
        <Nav navigation={navigation} />
        <View style={st.center}>
          <Text style={st.endTitle}>No Bytes yet.</Text>
          <Text style={st.endSub}>Write cards in the deck on your Mac; they sync here.</Text>
        </View>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <Nav navigation={navigation} />
        {chipsRow}
        <View style={st.center}>
          <View style={st.diamond} />
          <Text style={st.endTitle}>That&apos;s your drift for today.</Text>
          <Text style={st.endSub}>{index} seen · the ones you kept are in review now.</Text>
          <Pressable style={st.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={st.doneText}>Done</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const accent = accentOf(current.topic);

  return (
    <Screen>
      <Nav navigation={navigation} />
      {chipsRow}
      {/* progress */}
      <View style={st.track}>
        <View style={[st.trackFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <Animated.View style={[st.card, cardStyle]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.glow, { backgroundColor: c.amber }, glowStyle]} />
          <View style={st.topic}>
            <View style={[st.tdot, { backgroundColor: accent }]} />
            <Text style={st.topicText}>{current.topic.toUpperCase()}</Text>
            <Text style={st.count}>
              {index + 1} / {deck.length}
            </Text>
          </View>

          <View style={st.body}>
            <Text style={st.concept}>{current.title}</Text>
            {current.blurb ? <Text style={st.blurb}>{current.blurb}</Text> : null}
            {current.code ? (
              <View style={st.code}>
                <Text style={st.codeText}>{current.code}</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={st.keep} onPress={keep}>
            <View style={st.keepDot} />
            <Text style={st.keepText}>Keep</Text>
            <Text style={st.keepHint}>→ note · review</Text>
          </Pressable>
        </Animated.View>
      </View>

      <Text style={st.swipeHint}>swipe up for the next</Text>
    </Screen>
  );
}

function Nav({ navigation }: { navigation: Props['navigation'] }) {
  return (
    <View style={st.nav}>
      <Pressable onPress={() => navigation.goBack()} style={st.back} hitSlop={12}>
        <Ionicons name="chevron-back" size={22} color={c.accent} />
        <Text style={st.backText}>Today</Text>
      </Pressable>
      <Text style={st.navTitle}>Bytes</Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

const st = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  back: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backText: { ...t.body, color: c.accent, marginLeft: 2 },
  navTitle: { ...t.headline, fontFamily: serif, fontWeight: undefined, color: c.ink },

  track: { height: 3, marginHorizontal: 20, borderRadius: 2, backgroundColor: c.surface2, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2, backgroundColor: c.amber },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 20, paddingBottom: 12 },
  chip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface },
  chipOn: { backgroundColor: c.amber, borderColor: c.amber },
  chipText: { fontFamily: mono, fontSize: 11, color: c.ink2 },
  chipTextOn: { color: c.bg, fontWeight: '600' },

  card: {
    flex: 1,
    margin: 16,
    marginTop: 14,
    backgroundColor: c.surface,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    padding: 26,
    overflow: 'hidden',
    shadowColor: '#18130a',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  glow: { borderRadius: 26 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tdot: { width: 7, height: 7, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  topicText: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  count: { ...t.caption2, fontFamily: mono, color: c.ink3, marginLeft: 'auto' },

  body: { flex: 1, justifyContent: 'center' },
  concept: { fontFamily: serif, fontSize: 30, lineHeight: 34, color: c.ink, letterSpacing: -0.3, marginBottom: 14 },
  blurb: { fontFamily: serif, fontSize: 17, lineHeight: 25, color: c.ink2 },
  code: { backgroundColor: c.surface2, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 13, marginTop: 16 },
  codeText: { fontFamily: mono, fontSize: 12.5, lineHeight: 20, color: c.ink },

  keep: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.ink, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 16 },
  keepDot: { width: 11, height: 11, borderRadius: 2, backgroundColor: c.amber, transform: [{ rotate: '45deg' }] },
  keepText: { ...t.body, color: c.bg, fontWeight: '600' },
  keepHint: { ...t.caption1, fontFamily: mono, color: 'rgba(250,248,242,0.5)', marginLeft: 'auto' },

  swipeHint: { ...t.caption2, fontFamily: mono, color: c.ink3, textAlign: 'center', paddingBottom: 10, letterSpacing: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  diamond: { width: 16, height: 16, backgroundColor: c.amber, borderRadius: 3, transform: [{ rotate: '45deg' }], marginBottom: 10 },
  endTitle: { fontFamily: serif, fontSize: 24, color: c.ink, textAlign: 'center' },
  endSub: { fontFamily: serifItalic, fontSize: 15, color: c.ink2, textAlign: 'center', lineHeight: 22 },
  doneBtn: { marginTop: 18, backgroundColor: c.ink, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 30 },
  doneText: { ...t.body, color: c.bg, fontWeight: '600' },
});
