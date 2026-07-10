import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { c, inkOpacity, mono, serif, serifItalic, t } from '../theme';
import { Press, Rise } from '../motion';
import { LargeTitle, Pill, Screen, useBottomInset } from '../ui';
import { editedAgo, snippet, useData, type Note, type NoteMemory } from '../store';
import type { NotesStackParamList } from '../navTypes';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

function dueLabel(m: NoteMemory | undefined): { label: string; tone: 'ink' | 'amber' | 'green' } {
  if (!m) return { label: 'not in review', tone: 'ink' };
  if (m.due <= 0) return { label: 'due now', tone: 'amber' };
  return { label: `${m.due}d`, tone: 'green' };
}

function NoteRow({ note, memory, index }: { note: Note; memory?: NoteMemory; index: number }) {
  const nav = useNavigation<Nav>();
  const ink = inkOpacity(memory?.recall ?? null);
  const due = dueLabel(memory);

  return (
    <Rise delay={Math.min(index, 8) * 35}>
      <Press onPress={() => nav.navigate('Note', { id: note.id })} scaleTo={0.975} style={st.row}>
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
      </Press>
    </Rise>
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
          <Press onPress={onNew} style={st.newBtn} scaleTo={0.88}>
            <Ionicons name="add" size={20} color={c.bg} />
          </Press>
        }
      />
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => <NoteRow note={item} memory={memory[item.id]} index={index} />}
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

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  rowTitle: { ...t.headline, fontFamily: serif, fontWeight: undefined, fontSize: 19, color: c.ink },
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
  emptyText: { ...t.subhead, fontFamily: serifItalic, color: c.ink2, textAlign: 'center' },
});
