import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { c, mono, serif, serifItalic, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { useData, type NoteMemory } from '../store';
import type { Grade } from '../../core';

/*
 * Whole-note review, in two steps: pick a due note from the list, then read it
 * and grade it. The list exists because a queue of ten notes shouldn't dump the
 * first one's full text at you with no say in the matter — you choose what to
 * work on.
 *
 * The picker is NAVIGATION, not a reveal gate: once a note is open you see the
 * whole thing at once. Deliberately NO blur/front-back — Noto reviews the note
 * itself, not a flashcard.
 */
const GRADES: { g: Grade; label: string; color: string }[] = [
  { g: 1 as Grade, label: 'Again', color: c.red },
  { g: 2 as Grade, label: 'Hard', color: c.amber },
  { g: 3 as Grade, label: 'Good', color: c.accent },
  { g: 4 as Grade, label: 'Easy', color: c.green },
];

/** A calm one-liner from the body — markdown marks stripped, whitespace collapsed. */
function preview(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How well this note is known, for the row — or that it's brand new. */
function memoryLine(mem: NoteMemory | undefined): string {
  if (!mem || mem.hist.length === 0) return 'never reviewed';
  const n = mem.hist.length;
  const recall = mem.recall !== null ? ` · ${Math.round(mem.recall * 100)}% recall` : '';
  return `${n} review${n === 1 ? '' : 's'}${recall}`;
}

export function ReviewScreen() {
  const notes = useData((s) => s.notes);
  const memory = useData((s) => s.memory);
  const review = useData((s) => s.review);
  const bottom = useBottomInset();
  const [done, setDone] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const queue = useMemo(
    () => notes.filter((n) => (memory[n.id]?.due ?? 1) <= 0),
    [notes, memory],
  );

  // A picked note leaves the queue the moment it's graded, so resolve it fresh
  // each render — a stale id simply falls back to the list.
  const current = pickedId ? (queue.find((n) => n.id === pickedId) ?? null) : null;

  if (queue.length === 0) {
    return (
      <Screen>
        <LargeTitle kicker="spaced repetition" title="Review" />
        <View style={st.empty}>
          <Text style={st.emptyTitle}>Nothing due.</Text>
          <Text style={st.emptyHint}>
            {done > 0
              ? `${done} reviewed this session. The schedule takes it from here.`
              : 'Come back when a note is ready — early review is wasted effort.'}
          </Text>
        </View>
      </Screen>
    );
  }

  // ── The picker: every due note, one tap each ───────────────────────────
  if (!current) {
    return (
      <Screen>
        <LargeTitle kicker={`${queue.length} due · ${done} done`} title="Review" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 10 }}>
          <Text style={st.pickHint}>Pick what to work on.</Text>
          {queue.map((n, i) => (
            <Rise key={n.id} delay={Math.min(i, 8) * 22}>
              <Press
                scaleTo={0.98}
                haptic={false}
                onPress={() => {
                  haptics.selection();
                  setPickedId(n.id);
                }}
              >
                <Card>
                  <Text style={st.rowTitle} numberOfLines={1}>
                    {n.title || 'Untitled'}
                  </Text>
                  {preview(n.body) ? (
                    <Text style={st.rowPreview} numberOfLines={2}>
                      {preview(n.body)}
                    </Text>
                  ) : null}
                  <Text style={st.rowMeta}>{memoryLine(memory[n.id])}</Text>
                </Card>
              </Press>
            </Rise>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  // ── The review itself: the whole note, then grade it ───────────────────
  const mem = memory[current.id];

  return (
    <Screen>
      <LargeTitle kicker={`${queue.length} due · ${done} done`} title="Review" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}>
        <Press
          haptic={false}
          hitSlop={10}
          onPress={() => {
            haptics.light();
            setPickedId(null);
          }}
          style={st.back}
        >
          <Text style={st.backText}>‹ All due ({queue.length})</Text>
        </Press>

        <Card glass>
          <Text style={st.noteTitle}>{current.title}</Text>
          <Text style={st.body}>{current.body}</Text>
        </Card>
        {mem ? (
          <Text style={st.meta}>
            stability {mem.stab !== null ? `${mem.stab.toFixed(1)}d` : '—'} · recall{' '}
            {mem.recall !== null ? `${Math.round(mem.recall * 100)}%` : '—'} · {mem.hist.length} reviews
          </Text>
        ) : null}

        <View style={st.grades}>
          {GRADES.map((g, i) => (
            <Rise key={g.label} delay={60 + i * 45} style={{ flex: 1 }}>
              <Press
                scaleTo={0.9}
                haptic={false}
                onPress={() => {
                  // Each grade has its own feel; "Easy" earns the re-ink crescendo.
                  if (g.g === 1) haptics.warn();
                  else if (g.g === 2) haptics.rigid();
                  else if (g.g === 3) haptics.confirm();
                  else haptics.reink();
                  review(current.id, g.g).then(
                    () => {
                      setDone((d) => d + 1);
                      setPickedId(null); // back to the list — pick the next one
                    },
                    () => haptics.error(), // the optimistic haptic already fired; own the failure
                  );
                }}
                style={[st.grade, { borderColor: g.color }]}
              >
                <Text style={[st.gradeText, { color: g.color }]}>{g.label}</Text>
              </Press>
            </Rise>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  empty: { paddingHorizontal: 20, paddingTop: 40, gap: 8 },
  emptyTitle: { ...t.title2, fontFamily: serif, color: c.ink },
  emptyHint: { ...t.subhead, color: c.ink2, lineHeight: 21 },

  pickHint: { ...t.subhead, fontFamily: serifItalic, color: c.ink3, marginBottom: 2 },
  rowTitle: { ...t.headline, fontFamily: serif, color: c.ink },
  rowPreview: { ...t.subhead, color: c.ink2, lineHeight: 21, marginTop: 5 },
  rowMeta: { ...t.caption2, fontFamily: mono, color: c.ink3, marginTop: 9 },

  back: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 8 },
  backText: { ...t.footnote, color: c.accent },

  noteTitle: { ...t.title2, fontFamily: serif, color: c.ink, marginBottom: 10 },
  body: { ...t.body, color: c.ink, lineHeight: 26 },
  meta: { ...t.caption2, fontFamily: mono, color: c.ink3, marginTop: 12, textAlign: 'center' },
  grades: { flexDirection: 'row', gap: 8, marginTop: 20 },
  grade: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  gradeText: { ...t.footnote, fontWeight: '600' },
});
