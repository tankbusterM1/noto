import { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { c, inkOpacity, mono, radius, serif, t } from '../theme';
import { Card, LargeTitle, Pill, Screen, useBottomInset } from '../ui';
import { editedAgo, snippet, useData, type Note, type NoteMemory } from '../store';
import type { NotesStackParamList } from '../navTypes';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

function dueLabel(m: NoteMemory | undefined): { label: string; tone: 'ink' | 'amber' | 'green' } {
  if (!m) return { label: 'not in review', tone: 'ink' };
  if (m.due <= 0) return { label: 'due now', tone: 'amber' };
  return { label: `${m.due}d`, tone: 'green' };
}

function NoteRow({ note, memory }: { note: Note; memory?: NoteMemory }) {
  const nav = useNavigation<Nav>();
  const ink = inkOpacity(memory?.recall ?? null);
  const due = dueLabel(memory);

  return (
    <Pressable
      onPress={() => nav.navigate('Note', { id: note.id })}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.surface2 }]}
    >
      <View style={{ flex: 1, opacity: ink }}>
        <Text style={st.rowTitle} numberOfLines={1}>
          {note.title}
        </Text>
        <Text style={st.rowSnippet} numberOfLines={2}>
          {snippet(note.body)}
        </Text>
        <View style={st.rowMeta}>
          <Pill label={due.label} tone={due.tone} />
          {note.tags.slice(0, 2).map((tag) => (
            <Text key={tag} style={st.tag}>
              #{tag}
            </Text>
          ))}
          <View style={{ flex: 1 }} />
          <Text style={st.ago}>{editedAgo(note.updatedAt)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.ink3} style={{ marginLeft: 10 }} />
    </Pressable>
  );
}

export function NotesScreen() {
  const notes = useData((s) => s.notes);
  const memory = useData((s) => s.memory);
  const createNote = useData((s) => s.createNote);
  const nav = useNavigation<Nav>();
  const bottom = useBottomInset();

  const onNew = async () => {
    const id = await createNote();
    if (id) nav.navigate('Note', { id });
  };

  return (
    <Screen>
      <LargeTitle
        kicker={`library · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        title="Notes"
        trailing={
          <Pressable onPress={onNew} style={({ pressed }) => [st.newBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="add" size={20} color={c.bg} />
          </Pressable>
        }
      />
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NoteRow note={item} memory={memory[item.id]} />}
        ItemSeparatorComponent={() => <View style={st.sep} />}
        contentContainerStyle={{ paddingBottom: bottom }}
        ListEmptyComponent={
          <View style={st.empty}>
            <Text style={st.emptyText}>Nothing here yet — waiting for its first note.</Text>
          </View>
        }
      />
    </Screen>
  );
}

/** Minimal reader. The real editor (live preview) is the next milestone. */
function Markdown({ body }: { body: string }) {
  const lines = useMemo(() => body.split('\n'), [body]);
  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
        if (line.startsWith('## ')) return <Text key={i} style={st.h2}>{line.slice(3)}</Text>;
        if (line.startsWith('# ')) return <Text key={i} style={st.h1}>{line.slice(2)}</Text>;
        if (line.startsWith('- ')) return (
          <Text key={i} style={st.body}>
            <Text style={{ color: c.amber }}>• </Text>
            {line.slice(2)}
          </Text>
        );
        return <Text key={i} style={st.body}>{line}</Text>;
      })}
    </View>
  );
}

type Props = NativeStackScreenProps<NotesStackParamList, 'Note'>;

export function NoteScreen({ route, navigation }: Props) {
  const note = useData((s) => s.notes.find((n) => n.id === route.params.id));
  const memory = useData((s) => s.memory[route.params.id]);
  const saveNote = useData((s) => s.saveNote);
  const deleteNote = useData((s) => s.deleteNote);
  const bottom = useBottomInset();

  if (!note) {
    return (
      <Screen>
        <LargeTitle title="Gone" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={st.navBar}>
        <Pressable onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
          <Text style={st.backText}>Notes</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          hitSlop={12}
          onPress={async () => {
            await deleteNote(note.id);
            navigation.goBack();
          }}
        >
          <Ionicons name="trash-outline" size={19} color={c.red} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}>
        <TextInput
          value={note.title}
          onChangeText={(text) => void saveNote(note.id, { title: text })}
          style={st.title}
          placeholder="Untitled"
          placeholderTextColor={c.ink3}
        />

        {memory ? (
          <Card style={{ marginBottom: 20 }}>
            <Text style={st.cardKicker}>MEMORY</Text>
            <View style={st.memRow}>
              <Text style={st.memBig}>{memory.due <= 0 ? 'due now' : `in ${memory.due}d`}</Text>
            </View>
            <Text style={st.memSub}>
              recall {memory.recall !== null ? `${Math.round(memory.recall * 100)}%` : '—'} · stability{' '}
              {memory.stab !== null ? `${memory.stab.toFixed(1)}d` : '—'} · {memory.hist.length} reviews
            </Text>
          </Card>
        ) : null}

        <Markdown body={note.body} />
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  rowTitle: { ...t.headline, fontFamily: serif, fontSize: 18, color: c.ink },
  rowSnippet: { ...t.subhead, color: c.ink2, marginTop: 3, lineHeight: 20 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  tag: { ...t.caption2, fontFamily: mono, color: c.amber },
  ago: { ...t.caption2, fontFamily: mono, color: c.ink3 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 20 },
  newBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { ...t.subhead, fontFamily: serif, fontStyle: 'italic', color: c.ink2, textAlign: 'center' },

  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { ...t.body, color: c.accent, marginLeft: 2 },
  title: { ...t.largeTitle, fontFamily: serif, color: c.ink, paddingVertical: 8, marginBottom: 12 },
  cardKicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  memRow: { marginTop: 8 },
  memBig: { ...t.title2, fontFamily: serif, color: c.ink },
  memSub: { ...t.footnote, fontFamily: mono, color: c.ink3, marginTop: 6 },

  h1: { ...t.title1, fontFamily: serif, color: c.ink, marginTop: 8 },
  h2: { ...t.title3, fontFamily: serif, color: c.ink, marginTop: 8 },
  body: { ...t.body, color: c.ink, lineHeight: 26 },
});

export const noteScreenRadius = radius.lg;
