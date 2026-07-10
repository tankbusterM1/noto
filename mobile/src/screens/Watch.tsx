import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serif, serifItalic, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { LargeTitle, Screen, useBottomInset } from '../ui';
import { useData, type WatchItem } from '../store';
import type { TodayStackParamList } from '../navTypes';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const KIND: Record<WatchItem['kind'], { icon: IconName; color: string }> = {
  video: { icon: 'play', color: c.red },
  article: { icon: 'document-text-outline', color: c.accent },
  paper: { icon: 'school-outline', color: c.amber },
};

function Row({ item, index }: { item: WatchItem; index: number }) {
  const toggle = useData((s) => s.toggleWatch);
  const remove = useData((s) => s.removeWatch);
  const k = KIND[item.kind];

  return (
    <Rise delay={Math.min(index, 8) * 22}>
      <View style={st.row}>
        <Press
          scaleTo={0.9}
          haptic={false}
          onPress={() => {
            haptics.selection();
            void Linking.openURL(item.url).catch(() => haptics.error());
          }}
          style={[st.badge, { borderColor: k.color }]}
        >
          <Ionicons name={k.icon} size={15} color={k.color} />
        </Press>

        <View style={{ flex: 1, opacity: item.done ? 0.45 : 1 }}>
          <Text style={[st.title, item.done && st.titleDone]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={st.meta}>
            {item.source}
            {item.mins > 0 ? ` · ${item.mins}m` : ''}
          </Text>
        </View>

        <Press
          scaleTo={0.85}
          haptic={false}
          hitSlop={8}
          onPress={() => {
            if (!item.done) haptics.success();
            else haptics.light();
            void toggle(item.id);
          }}
          style={st.iconBtn}
        >
          <Ionicons
            name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={item.done ? c.green : c.ink3}
          />
        </Press>

        <Press
          scaleTo={0.85}
          haptic={false}
          hitSlop={8}
          onPress={() => {
            haptics.warning();
            void remove(item.id);
          }}
          style={st.iconBtn}
        >
          <Ionicons name="close" size={16} color={c.ink3} />
        </Press>
      </View>
    </Rise>
  );
}

type Props = NativeStackScreenProps<TodayStackParamList, 'Watch'>;

export function WatchScreen({ navigation }: Props) {
  const watch = useData((s) => s.watch);
  const addWatch = useData((s) => s.addWatch);
  const bottom = useBottomInset();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const queued = watch.filter((w) => !w.done).length;

  const submit = async () => {
    const url = draft.trim();
    if (!url) return;
    setErr(null);
    setBusy(true);
    const id = await addWatch(url);
    setBusy(false);
    if (!id) {
      haptics.error();
      setErr('That needs to be a full http(s) link.');
      return;
    }
    haptics.success();
    setDraft('');
  };

  return (
    <Screen>
      <View style={st.navBar}>
        <Press haptic={false} scaleTo={0.9} hitSlop={12} onPress={() => navigation.goBack()} style={st.back}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
          <Text style={st.backText}>Today</Text>
        </Press>
      </View>

      <LargeTitle kicker={`${queued} queued · ${watch.length - queued} watched`} title="Watch Later" />

      <View style={st.inputWrap}>
        <View style={st.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Paste a link…"
            placeholderTextColor={c.ink3}
            style={st.input}
          />
          {busy ? <ActivityIndicator size="small" color={c.ink3} style={{ marginLeft: 10 }} /> : null}
        </View>
        {err ? <Text style={st.err}>{err}</Text> : null}
        <Text style={st.hint}>The title is fetched for you. Offline? It saves under the hostname.</Text>
      </View>

      <FlatList
        data={watch}
        keyExtractor={(x) => x.id}
        renderItem={({ item, index }) => <Row item={item} index={index} />}
        ItemSeparatorComponent={() => <View style={st.sep} />}
        contentContainerStyle={{ paddingBottom: bottom }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={st.empty}>Nothing saved. Paste a link above.</Text>}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { ...t.body, color: c.accent, marginLeft: 2 },

  inputWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    ...t.body,
    flex: 1,
    fontFamily: mono,
    fontSize: 14,
    color: c.ink,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { ...t.caption2, color: c.ink3, marginTop: 8 },
  err: { ...t.caption1, fontFamily: serifItalic, color: c.red, marginTop: 8 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...t.callout, fontFamily: serif, fontSize: 16, color: c.ink },
  titleDone: { textDecorationLine: 'line-through' },
  meta: { ...t.caption2, fontFamily: mono, color: c.ink3, marginTop: 3 },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 66 },
  empty: { ...t.subhead, fontFamily: serifItalic, color: c.ink3, textAlign: 'center', paddingTop: 40 },
});
