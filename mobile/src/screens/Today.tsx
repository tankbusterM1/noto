import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { c, mono, serif, t } from '../theme';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { dueCount, useData } from '../store';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up.';
  if (h < 12) return 'Good morning.';
  if (h < 18) return 'Good afternoon.';
  return 'Good evening.';
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function TodayScreen() {
  const notes = useData((s) => s.notes);
  const memory = useData((s) => s.memory);
  const bottom = useBottomInset();

  const due = dueCount(memory);
  const inReview = Object.keys(memory).length;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Deterministic daily resurface: the same note all day, a different one tomorrow.
  const resurface = notes.length
    ? notes[Math.floor(Date.now() / 86_400_000) % notes.length]
    : null;

  return (
    <Screen>
      <LargeTitle kicker={today} title={greeting()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}>
        <Card>
          <Text style={st.kicker}>MEMORY · SPACED REVIEW</Text>
          <View style={st.statRow}>
            <Stat value={String(due)} label="due today" />
            <Stat value={String(inReview)} label="in review" />
            <Stat value={String(notes.length)} label="notes" />
          </View>
          <Text style={st.hint}>
            {due > 0
              ? `${due} ${due === 1 ? 'note is' : 'notes are'} ready. Reviewing now costs less than relearning later.`
              : 'Nothing due. Your ink is dark.'}
          </Text>
        </Card>

        {resurface ? (
          <Card>
            <Text style={st.kicker}>RESURFACED</Text>
            <Text style={st.resurfaceTitle}>{resurface.title}</Text>
            <Text style={st.hint}>
              Pulled from the vault at random — the notes you never review are the ones you quietly lose.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  kicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  statRow: { flexDirection: 'row', marginTop: 14, marginBottom: 12 },
  statValue: { ...t.title1, fontFamily: serif, color: c.ink },
  statLabel: { ...t.caption2, fontFamily: mono, letterSpacing: 1, color: c.ink3, marginTop: 2 },
  hint: { ...t.footnote, color: c.ink2, lineHeight: 19 },
  resurfaceTitle: { ...t.title3, fontFamily: serif, color: c.ink, marginTop: 8, marginBottom: 6 },
});
