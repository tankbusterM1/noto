import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serif, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { dueCount, useData } from '../store';
import type { TodayStackParamList } from '../navTypes';

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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function HubCard({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Press
      scaleTo={0.97}
      haptic={false}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={st.hub}
    >
      <View style={st.hubIcon}>
        <Ionicons name={icon} size={17} color={c.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.hubTitle}>{title}</Text>
        <Text style={st.hubDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.ink3} />
    </Press>
  );
}

type Props = NativeStackScreenProps<TodayStackParamList, 'TodayHome'>;

export function TodayScreen({ navigation }: Props) {
  const notes = useData((s) => s.notes);
  const memory = useData((s) => s.memory);
  const todos = useData((s) => s.todos);
  const watch = useData((s) => s.watch);
  const bytesN = useData((s) => s.bytes.length);
  const byteStreak = useData((s) => s.byteStreak);
  const bottom = useBottomInset();

  const due = dueCount(memory);
  const inReview = Object.keys(memory).length;
  const openTodos = todos.filter((x) => !x.done).length;
  const queued = watch.filter((w) => !w.done).length;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const resurface = notes.length ? notes[Math.floor(Date.now() / 86_400_000) % notes.length] : null;

  return (
    <Screen>
      <LargeTitle kicker={today} title={greeting()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}>
        <Rise delay={30}>
          <Card glass>
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
        </Rise>

        <Rise delay={80}>
          <View style={st.hubGroup}>
            <HubCard
              icon="checkbox-outline"
              title="Todos"
              detail={openTodos ? `${openTodos} open` : 'all clear'}
              onPress={() => navigation.navigate('Todos')}
            />
            <View style={st.hubSep} />
            <HubCard
              icon="play-circle-outline"
              title="Watch Later"
              detail={queued ? `${queued} queued` : 'nothing saved'}
              onPress={() => navigation.navigate('Watch')}
            />
            <View style={st.hubSep} />
            <HubCard
              icon="sparkles-outline"
              title="Bytes"
              detail={byteStreak.count > 0 ? `${byteStreak.count}-day streak · ${bytesN} cards` : bytesN ? `${bytesN} cards` : 'sync a pack'}
              onPress={() => navigation.navigate('Bytes')}
            />
          </View>
        </Rise>

        {resurface ? (
          <Rise delay={130}>
            <Card glass>
              <Text style={st.kicker}>RESURFACED</Text>
              <Text style={st.resurfaceTitle}>{resurface.title}</Text>
              <Text style={st.hint}>
                Pulled from the vault at random — the notes you never review are the ones you quietly lose.
              </Text>
            </Card>
          </Rise>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  kicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  statRow: { flexDirection: 'row', marginTop: 14, marginBottom: 12 },
  statValue: { ...t.title1, fontFamily: serif, fontWeight: undefined, color: c.ink },
  statLabel: { ...t.caption2, fontFamily: mono, letterSpacing: 1, color: c.ink3, marginTop: 2 },
  hint: { ...t.footnote, color: c.ink2, lineHeight: 19 },
  resurfaceTitle: { ...t.title3, fontFamily: serif, fontWeight: undefined, color: c.ink, marginTop: 8, marginBottom: 6 },

  hubGroup: {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: 'hidden',
  },
  hub: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  hubIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: c.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubTitle: { ...t.headline, color: c.ink },
  hubDetail: { ...t.caption1, fontFamily: mono, color: c.ink3, marginTop: 2 },
  hubSep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 60 },
});
