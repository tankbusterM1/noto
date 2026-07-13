import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serif, t } from '../theme';
import { haptics } from '../motion';
import { Screen } from '../ui';
import { useData } from '../store';
import { bytesFeed, bytesMemory, dates } from '../../core';
import type { TodayStackParamList } from '../navTypes';

const NEVER = ReduceMotion.Never;
const SPRING = { damping: 20, stiffness: 200, mass: 0.7, reduceMotion: NEVER };
const SWIPE = 90; // px past which a drag becomes an advance

const ACCENT: Record<string, string> = { ml: c.amber, ai: c.amber, sql: c.green, python: c.accent, algo: c.red, stats: c.accent, cs: c.ink2 };
const accentOf = (topic: string) => ACCENT[topic] ?? c.amber;

// The memory meter's colour, by strength band.
const BAND_COLOR: Record<string, string> = { fresh: c.green, solid: c.amber, fading: '#c8702a', cold: c.red, new: c.ink3 };

type Props = NativeStackScreenProps<TodayStackParamList, 'Bytes'>;

export function BytesScreen({ navigation }: Props) {
  const bytes = useData((s) => s.bytes);
  const byteMemory = useData((s) => s.byteMemory);
  const seeByte = useData((s) => s.seeByte);
  const answerByte = useData((s) => s.answerByte);
  const { height: H } = useWindowDimensions();
  const today = dates.todayEpochDay();

  // Snapshot cards + memory at mount, so answering a card mid-scroll never
  // reshuffles the feed under you. Only the tag filter rebuilds it.
  const bytesSnap = useRef(bytes).current;
  const memSnap = useRef(byteMemory).current;
  const [filter, setFilter] = useState<string | null>(null);
  const topics = useMemo(() => [...new Set(bytesSnap.map((b) => b.topic))].sort(), [bytesSnap]);
  const feed = useMemo(() => {
    const pool = filter ? bytesSnap.filter((b) => b.topic === filter) : bytesSnap;
    return bytesFeed.buildFeed(pool, memSnap, today, 20);
  }, [filter, bytesSnap, memSnap, today]);

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const lenRef = useRef(feed.length);
  lenRef.current = feed.length;
  const setIdx = (i: number) => {
    indexRef.current = i;
    setIndex(i);
  };

  const current = index < feed.length ? feed[index] : null;

  // Each card is processed once per session: a read counts a sighting when shown;
  // a checkpoint is graded when answered (below).
  const processed = useRef(new Set<string>()).current;
  useEffect(() => {
    if (current && current.mode === 'read' && !processed.has(current.card.id)) {
      processed.add(current.card.id);
      void seeByte(current.card.id);
    }
  }, [current?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── animation state ──────────────────────────────────────────────────
  const y = useSharedValue(0);
  const busy = useRef(false);
  const [picked, setPicked] = useState<string | null>(null); // chosen checkpoint answer

  const land = (delta: number) => {
    const ni = Math.max(0, Math.min(indexRef.current + delta, lenRef.current));
    setIdx(ni);
    setPicked(null);
    y.value = delta > 0 ? H : -H; // new card starts off-screen on the opposite edge
    y.value = withSpring(0, SPRING);
    haptics.tick();
  };

  // Always runs on the JS thread — clears the input lock however the fling ended,
  // so the reader can never freeze mid-swipe.
  const settle = (delta: number, finished: boolean) => {
    busy.current = false;
    if (finished) land(delta);
  };

  const fling = (delta: number) => {
    const ni = indexRef.current + delta;
    if (ni < 0 || ni > lenRef.current) {
      y.value = withSpring(0, SPRING);
      return;
    }
    busy.current = true;
    const off = delta > 0 ? -H : H;
    y.value = withTiming(off, { duration: 220, easing: Easing.bezier(0.5, 0, 0.2, 1), reduceMotion: NEVER }, (fin) => {
      runOnJS(settle)(delta, !!fin);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (busy.current) return;
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

  const answer = (choice: string) => {
    if (busy.current || picked || !current?.checkpoint) return;
    const right = choice === current.checkpoint.answer;
    setPicked(choice);
    if (!processed.has(current.card.id)) {
      processed.add(current.card.id);
      void answerByte(current.card.id, right ? 'good' : 'again');
    }
    if (right) haptics.confirm();
    else haptics.tick();
    busy.current = true;
    setTimeout(() => {
      busy.current = false;
      fling(1);
    }, 900);
  };

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const pickTopic = (tp: string | null) => {
    if (busy.current || tp === filter) return;
    y.value = 0;
    setPicked(null);
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

  const progress = feed.length ? Math.min(index, feed.length) / feed.length : 0;

  // ── empty / finished states ──────────────────────────────────────────
  if (feed.length === 0) {
    return (
      <Screen>
        <Nav navigation={navigation} />
        {chipsRow}
        <View style={st.center}>
          <View style={st.diamond} />
          <Text style={st.endTitle}>All caught up.</Text>
          <Text style={st.endSub}>Nothing new or due right now — come back later and the reel refills.</Text>
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
          <Text style={st.endSub}>{index} done · they&apos;ll resurface on their own schedule.</Text>
          <Pressable style={st.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={st.doneText}>Done</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const card = current.card;
  const accent = accentOf(card.topic);
  const mem = memSnap[card.id];
  const strength = mem ? bytesMemory.strengthAt(mem, today) : null;
  const band = strength == null ? 'new' : bytesMemory.strengthBand(strength);

  return (
    <Screen>
      <Nav navigation={navigation} />
      {chipsRow}
      <View style={st.track}>
        <View style={[st.trackFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <Animated.View style={[st.card, cardStyle]}>
          <View style={st.topic}>
            <View style={[st.tdot, { backgroundColor: accent }]} />
            <Text style={st.topicText}>
              {current.mode === 'checkpoint' ? 'QUICK CHECK · ' : ''}
              {card.topic.toUpperCase()}
            </Text>
            <Text style={st.count}>
              {index + 1} / {feed.length}
            </Text>
          </View>

          {current.mode === 'checkpoint' && current.checkpoint ? (
            // ── checkpoint ──
            <View style={st.body}>
              <Text style={st.prompt}>{current.checkpoint.prompt}</Text>
              <View style={st.choices}>
                {current.checkpoint.choices.map((ch) => {
                  const isAnswer = ch === current.checkpoint!.answer;
                  const reveal = picked != null && (ch === picked || isAnswer);
                  return (
                    <Pressable
                      key={ch}
                      onPress={() => answer(ch)}
                      disabled={picked != null}
                      style={[st.choice, reveal && isAnswer && st.choiceRight, reveal && ch === picked && !isAnswer && st.choiceWrong]}
                    >
                      <Text style={[st.choiceText, reveal && (isAnswer || ch === picked) && st.choiceTextOn]}>{ch}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {picked != null ? (
                <Text style={[st.verdict, picked === current.checkpoint.answer ? st.verdictRight : st.verdictWrong]}>
                  {picked === current.checkpoint.answer ? '✓ got it' : `✗ it's ${current.checkpoint.answer}`}
                </Text>
              ) : null}
            </View>
          ) : (
            // ── read ──
            <View style={st.body}>
              <Text style={st.concept}>{card.title}</Text>
              {card.blurb ? <Text style={st.blurb}>{card.blurb}</Text> : null}
              {card.code ? (
                <View style={st.code}>
                  <Text style={st.codeText}>{card.code}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* memory meter */}
          <View style={st.meterRow}>
            <View style={st.meterTrack}>
              <View style={[st.meterFill, { width: `${Math.round((strength ?? 0) * 100)}%`, backgroundColor: BAND_COLOR[band] }]} />
            </View>
            <Text style={[st.meterLabel, { color: BAND_COLOR[band] }]}>{band === 'new' ? 'new' : `${band} · ${Math.round((strength ?? 0) * 100)}%`}</Text>
          </View>
        </Animated.View>
      </View>

      <Text style={st.swipeHint}>{current.mode === 'checkpoint' && picked == null ? 'tap the answer' : 'swipe up for the next'}</Text>
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
  chipText: { ...t.caption1, fontFamily: mono, color: c.ink2 },
  chipTextOn: { color: c.bg },

  card: { flex: 1, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 26, paddingVertical: 24, borderRadius: 22, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, justifyContent: 'space-between' },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tdot: { width: 7, height: 7, borderRadius: 4 },
  topicText: { ...t.caption2, fontFamily: mono, letterSpacing: 1.4, color: c.ink3, flex: 1 },
  count: { ...t.caption2, fontFamily: mono, color: c.ink3 },

  body: { flex: 1, justifyContent: 'center' },
  concept: { ...t.title1, fontFamily: serif, fontWeight: undefined, color: c.ink, marginBottom: 14 },
  blurb: { ...t.body, color: c.ink2, lineHeight: 25 },
  code: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: c.surface2 },
  codeText: { fontFamily: mono, fontSize: 13, lineHeight: 20, color: c.ink },

  // checkpoint
  prompt: { fontFamily: mono, fontSize: 15, lineHeight: 24, color: c.ink, padding: 14, borderRadius: 12, backgroundColor: c.surface2, marginBottom: 18 },
  choices: { gap: 9 },
  choice: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface },
  choiceRight: { backgroundColor: c.green, borderColor: c.green },
  choiceWrong: { backgroundColor: c.red, borderColor: c.red },
  choiceText: { ...t.body, fontFamily: mono, color: c.ink, textAlign: 'center' },
  choiceTextOn: { color: c.bg },
  verdict: { ...t.footnote, fontFamily: mono, textAlign: 'center', marginTop: 14 },
  verdictRight: { color: c.green },
  verdictWrong: { color: c.red },

  // memory meter
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  meterTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.surface2, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  meterLabel: { ...t.caption2, fontFamily: mono, letterSpacing: 0.5, minWidth: 74, textAlign: 'right' },

  swipeHint: { ...t.caption1, fontFamily: mono, color: c.ink3, textAlign: 'center', paddingBottom: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  diamond: { width: 12, height: 12, backgroundColor: c.amber, transform: [{ rotate: '45deg' }], marginBottom: 10 },
  endTitle: { ...t.title2, fontFamily: serif, fontWeight: undefined, color: c.ink, textAlign: 'center' },
  endSub: { ...t.body, color: c.ink2, textAlign: 'center', lineHeight: 24 },
  doneBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 999, backgroundColor: c.ink },
  doneText: { ...t.headline, color: c.bg },
});
