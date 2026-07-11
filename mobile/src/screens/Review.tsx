import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { c, mono, serif, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { useData } from '../store';
import type { Grade } from '../../core';

/*
 * Whole-note review. Deliberately NO blur/reveal gate: Noto reviews the note
 * itself, not a flashcard front/back. You read it, then say how well you knew it.
 */
const GRADES: { g: Grade; label: string; color: string }[] = [
  { g: 1 as Grade, label: 'Again', color: c.red },
  { g: 2 as Grade, label: 'Hard', color: c.amber },
  { g: 3 as Grade, label: 'Good', color: c.accent },
  { g: 4 as Grade, label: 'Easy', color: c.green },
];

export function ReviewScreen() {
  const notes = useData((s) => s.notes);
  const memory = useData((s) => s.memory);
  const review = useData((s) => s.review);
  const bottom = useBottomInset();
  const [done, setDone] = useState(0);

  const queue = useMemo(
    () => notes.filter((n) => (memory[n.id]?.due ?? 1) <= 0),
    [notes, memory],
  );
  const current = queue[0];

  if (!current) {
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

  const mem = memory[current.id];

  return (
    <Screen>
      <LargeTitle kicker={`${queue.length} due · ${done} done`} title="Review" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}>
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
                    () => setDone((d) => d + 1),
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
