import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { c, inkOpacity, mono, radius, serif, serifItalic, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { LargeTitle, Pill, Screen, useBottomInset } from '../ui';
import { editedAgo, snippet, useData, type Folder, type Note, type NoteMemory } from '../store';
import type { NotesStackParamList } from '../navTypes';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

const ALL = 'all';

function dueLabel(m: NoteMemory | undefined): { label: string; tone: 'ink' | 'amber' | 'green' } {
  if (!m) return { label: 'not in review', tone: 'ink' };
  if (m.due <= 0) return { label: 'due now', tone: 'amber' };
  return { label: `${m.due}d`, tone: 'green' };
}

function NoteRow({
  note,
  memory,
  index,
  onPress,
  onLongPress,
}: {
  note: Note;
  memory?: NoteMemory;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const ink = inkOpacity(memory?.recall ?? null);
  const due = dueLabel(memory);

  return (
    <Rise delay={Math.min(index, 8) * 35}>
      <Press onPress={onPress} onLongPress={onLongPress} scaleTo={0.975} style={st.row}>
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

/** A rounded folder/All chip. Long-press is only meaningful for real folders. */
function Chip({
  label,
  count,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[st.chip, active && st.chipActive]}
      hitSlop={4}
    >
      <Text style={[st.chipText, active && st.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? <Text style={[st.chipCount, active && st.chipTextActive]}>{count}</Text> : null}
    </Pressable>
  );
}

export function NotesScreen() {
  const notes = useData((s) => s.notes);
  const folders = useData((s) => s.folders);
  const memory = useData((s) => s.memory);
  const createNote = useData((s) => s.createNote);
  const createFolder = useData((s) => s.createFolder);
  const renameFolder = useData((s) => s.renameFolder);
  const deleteFolder = useData((s) => s.deleteFolder);
  const moveNote = useData((s) => s.moveNote);
  const nav = useNavigation<Nav>();
  const bottom = useBottomInset();

  const [sel, setSel] = useState<string>(ALL);
  // Modals — one at a time.
  const [naming, setNaming] = useState<{ id?: string; value: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [acting, setActing] = useState<Folder | null>(null);
  const [armed, setArmed] = useState(false); // delete confirmation

  // The selected folder may vanish (deleted, or synced away) — fall back to All.
  const selValid = sel === ALL || folders.some((f) => f.id === sel);
  const activeSel = selValid ? sel : ALL;

  const shown = useMemo(
    () => (activeSel === ALL ? notes : notes.filter((n) => n.folderId === activeSel)),
    [notes, activeSel],
  );
  const countIn = (fid: string) => notes.filter((n) => n.folderId === fid).length;

  const onNew = async () => {
    haptics.commit();
    const id = await createNote(undefined, activeSel === ALL ? undefined : activeSel);
    if (id) nav.navigate('Note', { id });
  };

  const submitName = async () => {
    if (!naming) return;
    const value = naming.value.trim();
    if (!value) return setNaming(null);
    if (naming.id) await renameFolder(naming.id, value);
    else {
      const id = await createFolder(value);
      setSel(id);
    }
    haptics.confirm();
    setNaming(null);
  };

  const doDelete = async () => {
    if (!acting) return;
    await deleteFolder(acting.id);
    haptics.warn();
    if (sel === acting.id) setSel(ALL);
    setActing(null);
    setArmed(false);
  };

  return (
    <Screen>
      <LargeTitle
        kicker={`library · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        title="Notes"
        trailing={
          <Press onPress={onNew} haptic={false} style={st.newBtn} scaleTo={0.88}>
            <Ionicons name="add" size={20} color={c.bg} />
          </Press>
        }
      />

      {/* Folder rail — All, each folder, then "+ Folder". */}
      <View style={st.railWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.rail}
          keyboardShouldPersistTaps="handled"
        >
          <Chip
            label="All"
            count={notes.length}
            active={activeSel === ALL}
            onPress={() => {
              haptics.selection();
              setSel(ALL);
            }}
          />
          {folders.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              count={countIn(f.id)}
              active={activeSel === f.id}
              onPress={() => {
                haptics.selection();
                setSel(f.id);
              }}
              onLongPress={() => {
                haptics.medium();
                setArmed(false);
                setActing(f);
              }}
            />
          ))}
          <Pressable style={st.addChip} onPress={() => setNaming({ value: '' })} hitSlop={4}>
            <Ionicons name="add" size={15} color={c.ink2} />
            <Text style={st.addChipText}>Folder</Text>
          </Pressable>
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => (
          <NoteRow
            note={item}
            memory={memory[item.id]}
            index={index}
            onPress={() => nav.navigate('Note', { id: item.id })}
            onLongPress={() => {
              if (folders.length > 1) {
                haptics.medium();
                setMoving(item.id);
              }
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={st.sep} />}
        contentContainerStyle={{ paddingBottom: bottom }}
        ListEmptyComponent={
          <View style={st.empty}>
            <Text style={st.emptyText}>
              {activeSel === ALL ? 'Nothing here yet — waiting for its first note.' : 'This folder is empty.'}
            </Text>
          </View>
        }
      />

      {/* Name a folder (create or rename). */}
      <Modal visible={!!naming} transparent animationType="fade" onRequestClose={() => setNaming(null)}>
        <Pressable style={st.backdrop} onPress={() => setNaming(null)}>
          <Pressable style={st.sheet} onPress={() => {}}>
            <Text style={st.sheetTitle}>{naming?.id ? 'Rename folder' : 'New folder'}</Text>
            <TextInput
              value={naming?.value ?? ''}
              onChangeText={(v) => setNaming((cur) => (cur ? { ...cur, value: v } : cur))}
              placeholder="Folder name"
              placeholderTextColor={c.ink3}
              autoFocus
              style={st.input}
              onSubmitEditing={() => void submitName()}
              returnKeyType="done"
            />
            <View style={st.sheetRow}>
              <Pressable style={st.ghostBtn} onPress={() => setNaming(null)}>
                <Text style={st.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={st.primaryBtn} onPress={() => void submitName()}>
                <Text style={st.primaryText}>{naming?.id ? 'Rename' : 'Create'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Folder actions (rename / delete). */}
      <Modal
        visible={!!acting}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setActing(null);
          setArmed(false);
        }}
      >
        <Pressable
          style={st.backdrop}
          onPress={() => {
            setActing(null);
            setArmed(false);
          }}
        >
          <Pressable style={st.sheet} onPress={() => {}}>
            <Text style={st.sheetTitle} numberOfLines={1}>
              {acting?.name}
            </Text>
            <Text style={st.sheetHint}>{acting ? `${countIn(acting.id)} notes` : ''}</Text>
            <Pressable
              style={st.listBtn}
              onPress={() => {
                if (!acting) return;
                setNaming({ id: acting.id, value: acting.name });
                setActing(null);
              }}
            >
              <Ionicons name="pencil-outline" size={17} color={c.ink} />
              <Text style={st.listBtnText}>Rename</Text>
            </Pressable>
            {folders.length > 1 ? (
              <Pressable style={st.listBtn} onPress={() => (armed ? void doDelete() : setArmed(true))}>
                <Ionicons name="trash-outline" size={17} color={c.red} />
                <Text style={[st.listBtnText, { color: c.red }]}>
                  {armed ? 'Tap again — notes move to another folder' : 'Delete folder'}
                </Text>
              </Pressable>
            ) : (
              <Text style={st.sheetHint}>The last folder can’t be deleted.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move a note to a folder. */}
      <Modal visible={!!moving} transparent animationType="fade" onRequestClose={() => setMoving(null)}>
        <Pressable style={st.backdrop} onPress={() => setMoving(null)}>
          <Pressable style={st.sheet} onPress={() => {}}>
            <Text style={st.sheetTitle}>Move to folder</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {folders.map((f) => {
                const here = moving ? notes.find((n) => n.id === moving)?.folderId === f.id : false;
                return (
                  <Pressable
                    key={f.id}
                    style={st.listBtn}
                    onPress={async () => {
                      if (moving && !here) {
                        await moveNote(moving, f.id);
                        haptics.success();
                      }
                      setMoving(null);
                    }}
                  >
                    <Ionicons name={here ? 'folder' : 'folder-outline'} size={17} color={here ? c.amber : c.ink2} />
                    <Text style={[st.listBtnText, here && { color: c.amber }]} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {here ? <Ionicons name="checkmark" size={16} color={c.amber} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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

  // rail
  railWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  rail: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  chipActive: { backgroundColor: 'rgba(184,122,38,0.12)', borderColor: c.amber },
  chipText: { ...t.footnote, fontFamily: mono, color: c.ink2 },
  chipTextActive: { color: c.amber },
  chipCount: { ...t.caption2, fontFamily: mono, color: c.ink3 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderStyle: 'dashed',
  },
  addChipText: { ...t.footnote, fontFamily: mono, color: c.ink2 },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { ...t.subhead, fontFamily: serifItalic, color: c.ink2, textAlign: 'center' },

  // modals
  backdrop: { flex: 1, backgroundColor: 'rgba(24,19,10,0.42)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.bg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    padding: 18,
    gap: 10,
  },
  sheetTitle: { ...t.title3, fontFamily: serif, color: c.ink },
  sheetHint: { ...t.footnote, color: c.ink3 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    color: c.ink,
    backgroundColor: c.surface2,
  },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ghostBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  ghostText: { ...t.callout, color: c.ink2, fontWeight: '600' },
  primaryBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center', backgroundColor: c.ink },
  primaryText: { ...t.callout, color: c.bg, fontWeight: '600' },
  listBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  listBtnText: { ...t.body, color: c.ink },
});
