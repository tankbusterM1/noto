import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  InputAccessoryView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serif, serifBold, serifItalic, t } from '../theme';
import { GlassSurface } from '../glass';
import { haptics } from '../motion';
import { pickPhotoDataUrl } from '../photo';
import { Card, Screen, useBottomInset } from '../ui';
import { useData } from '../store';
import type { NotesStackParamList } from '../navTypes';

const ACCESSORY_ID = 'noto.editor.toolbar';

/* ── read view ────────────────────────────────────────────────────────
 * A small markdown renderer: headings, bullets, quotes, and inline
 * **bold** / *italic* / `code`. This is the reading half; typing is a plain
 * TextInput, because RN has no contentEditable and CodeMirror needs a DOM.
 */
type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function inlineSpans(line: string): Span[] {
  const out: Span[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else out.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.length ? out : [{ text: line }];
}

function Inline({ line, style }: { line: string; style?: object }) {
  return (
    <Text style={style}>
      {inlineSpans(line).map((s, i) => (
        <Text
          key={i}
          style={[
            s.bold && { fontFamily: serifBold },
            s.italic && { fontFamily: serifItalic },
            s.code && { fontFamily: mono, fontSize: 14, color: c.amber },
          ]}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/* A note image (`![alt](dataURL|https…)`) — sized to its own aspect ratio so it
 * never letterboxes. Only data:image and http(s) sources render; anything else
 * (never expected from our own writer) is dropped. */
const IMG_LINE = /^!\[([^\]]*)\]\(([^\s]+)\)\s*$/;

function NoteImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(1.6);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (alive && w && h) setRatio(w / h);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return <Image source={{ uri }} style={[st.image, { aspectRatio: ratio }]} resizeMode="cover" />;
}

function Markdown({ body }: { body: string }) {
  const lines = useMemo(() => body.split('\n'), [body]);
  if (!body.trim()) {
    return <Text style={st.emptyBody}>Empty. Tap ✎ to start writing.</Text>;
  }
  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <View key={i} style={{ height: 8 }} />;
        const img = line.match(IMG_LINE);
        if (img && /^(https?:|data:image\/)/i.test(img[2])) return <NoteImage key={i} uri={img[2]} />;
        if (line.startsWith('### ')) return <Inline key={i} line={line.slice(4)} style={st.h3} />;
        if (line.startsWith('## ')) return <Inline key={i} line={line.slice(3)} style={st.h2} />;
        if (line.startsWith('# ')) return <Inline key={i} line={line.slice(2)} style={st.h1} />;
        if (line.startsWith('> ')) return <Inline key={i} line={line.slice(2)} style={st.quote} />;
        if (/^[-*] /.test(line))
          return (
            <View key={i} style={st.bulletRow}>
              <Text style={st.bulletDot}>•</Text>
              <Inline line={line.slice(2)} style={st.bodyText} />
            </View>
          );
        return <Inline key={i} line={line} style={st.bodyText} />;
      })}
    </View>
  );
}

/* ── toolbar ──────────────────────────────────────────────────────── */
function ToolButton({ label, onPress, font }: { label: string; onPress: () => void; font?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.tool, pressed && { opacity: 0.5 }]} hitSlop={6}>
      <Text style={[st.toolText, font ? { fontFamily: font } : null]}>{label}</Text>
    </Pressable>
  );
}

type Props = NativeStackScreenProps<NotesStackParamList, 'Note'>;

export function NoteScreen({ route, navigation }: Props) {
  const id = route.params.id;
  const note = useData((s) => s.notes.find((n) => n.id === id));
  const memory = useData((s) => s.memory[id]);
  const saveNote = useData((s) => s.saveNote);
  const deleteNote = useData((s) => s.deleteNote);
  const bottom = useBottomInset();

  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState(note?.body ?? '');
  const [title, setTitle] = useState(note?.title ?? '');
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [forceSel, setForceSel] = useState<{ start: number; end: number } | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // Debounced autosave, plus a flush on unmount so the last keystrokes survive
  // a back-swipe (the desktop learned this lesson the hard way).
  useEffect(() => {
    if (!note || body === note.body) return;
    const h = setTimeout(() => void saveNote(id, { body }), 450);
    return () => clearTimeout(h);
  }, [body, note, id, saveNote]);

  useEffect(() => {
    return () => {
      const latest = bodyRef.current;
      if (note && latest !== note.body) void saveNote(id, { body: latest });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!note) {
    return (
      <Screen>
        <Text style={st.emptyBody}>This note is gone.</Text>
      </Screen>
    );
  }

  const wrap = (before: string, after = before) => {
    const { start, end } = sel;
    const mid = body.slice(start, end);
    const insert = before + mid + after;
    setBody(body.slice(0, start) + insert + body.slice(end));
    const caret = mid ? start + insert.length : start + before.length;
    setForceSel({ start: caret, end: caret });
  };

  const prefixLine = (prefix: string) => {
    const lineStart = body.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
    const has = body.startsWith(prefix, lineStart);
    const next = has
      ? body.slice(0, lineStart) + body.slice(lineStart + prefix.length)
      : body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(next);
    const caret = Math.max(lineStart, sel.start + (has ? -prefix.length : prefix.length));
    setForceSel({ start: caret, end: caret });
  };

  // Pick a photo, insert it as its own `![image](dataURL)` line at the caret,
  // then flip to reading view so the picture shows instead of the base64 blob
  // (a plain TextInput can't hide the data-URL the way the desktop editor does).
  const [picking, setPicking] = useState(false);
  const insertPhoto = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const dataUrl = await pickPhotoDataUrl();
      if (!dataUrl) return;
      const { start, end } = sel;
      const nl = start > 0 && body[start - 1] !== '\n' ? '\n' : '';
      const snippet = `${nl}![image](${dataUrl})\n`;
      setBody(body.slice(0, start) + snippet + body.slice(end));
      haptics.confirm();
      setWriting(false);
    } catch {
      haptics.error();
    } finally {
      setPicking(false);
    }
  };

  const toolbar = (
    <GlassSurface style={st.toolbar} fallbackColor={c.surface} interactive>
      <ToolButton label="B" font={serifBold} onPress={() => wrap('**')} />
      <ToolButton label="i" font={serifItalic} onPress={() => wrap('*')} />
      <ToolButton label="H" font={serifBold} onPress={() => prefixLine('## ')} />
      <ToolButton label="•" onPress={() => prefixLine('- ')} />
      <ToolButton label="❝" onPress={() => prefixLine('> ')} />
      <ToolButton label="‹›" font={mono} onPress={() => wrap('`')} />
      <ToolButton label="[[ ]]" font={mono} onPress={() => wrap('[[', ']]')} />
      <Pressable onPress={insertPhoto} disabled={picking} style={({ pressed }) => [st.tool, pressed && { opacity: 0.5 }]} hitSlop={6}>
        <Ionicons name="image-outline" size={19} color={picking ? c.ink3 : c.ink} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <ToolButton label="Done" onPress={() => setWriting(false)} />
    </GlassSurface>
  );

  return (
    <Screen>
      <View style={st.navBar}>
        <Pressable onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
          <Text style={st.backText}>Notes</Text>
        </Pressable>
        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => setWriting((v) => !v)}
          style={({ pressed }) => [st.modeBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name={writing ? 'book-outline' : 'create-outline'} size={19} color={c.ink} />
        </Pressable>

        <Pressable
          hitSlop={12}
          style={{ marginLeft: 16 }}
          onPress={async () => {
            await deleteNote(id);
            navigation.goBack();
          }}
        >
          <Ionicons name="trash-outline" size={19} color={c.red} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            onEndEditing={() => title.trim() && title !== note.title && void saveNote(id, { title: title.trim() })}
            style={st.title}
            placeholder="Untitled"
            placeholderTextColor={c.ink3}
            multiline
          />

          {memory ? (
            <Card style={{ marginBottom: 18 }}>
              <Text style={st.cardKicker}>MEMORY</Text>
              <Text style={st.memBig}>{memory.due <= 0 ? 'due now' : `in ${memory.due}d`}</Text>
              <Text style={st.memSub}>
                recall {memory.recall !== null ? `${Math.round(memory.recall * 100)}%` : '—'} · stability{' '}
                {memory.stab !== null ? `${memory.stab.toFixed(1)}d` : '—'} · {memory.hist.length} reviews
              </Text>
            </Card>
          ) : null}

          {writing ? (
            <TextInput
              value={body}
              onChangeText={setBody}
              onSelectionChange={(e) => {
                setSel(e.nativeEvent.selection);
                if (forceSel) setForceSel(null);
              }}
              selection={forceSel ?? undefined}
              multiline
              autoFocus
              scrollEnabled={false}
              textAlignVertical="top"
              placeholder="Write, in markdown…"
              placeholderTextColor={c.ink3}
              style={st.editor}
              inputAccessoryViewID={Platform.OS === 'ios' ? ACCESSORY_ID : undefined}
            />
          ) : (
            <Pressable onPress={() => setWriting(true)}>
              <Markdown body={body} />
            </Pressable>
          )}
        </ScrollView>

        {/* Android has no InputAccessoryView — pin the bar above the keyboard. */}
        {writing && Platform.OS !== 'ios' ? toolbar : null}
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>{toolbar}</InputAccessoryView>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { ...t.body, color: c.accent, marginLeft: 2 },
  modeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  title: { ...t.largeTitle, fontFamily: serif, fontWeight: undefined, color: c.ink, paddingVertical: 6, marginBottom: 10 },
  editor: {
    ...t.body,
    fontFamily: serif,
    color: c.ink,
    lineHeight: 27,
    minHeight: 320,
    paddingTop: 0,
  },

  cardKicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  memBig: { ...t.title2, fontFamily: serif, fontWeight: undefined, color: c.ink, marginTop: 8 },
  memSub: { ...t.footnote, fontFamily: mono, color: c.ink3, marginTop: 6 },

  h1: { ...t.title1, fontFamily: serifBold, fontWeight: undefined, color: c.ink, marginTop: 10 },
  h2: { ...t.title3, fontFamily: serifBold, fontWeight: undefined, color: c.ink, marginTop: 10 },
  h3: { ...t.headline, fontFamily: serifBold, fontWeight: undefined, color: c.ink, marginTop: 8 },
  quote: { ...t.body, fontFamily: serifItalic, color: c.ink2, lineHeight: 26, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: c.line },
  bodyText: { ...t.body, fontFamily: serif, color: c.ink, lineHeight: 27 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { ...t.body, color: c.amber, lineHeight: 27 },
  image: { width: '100%', borderRadius: 12, marginVertical: 4, backgroundColor: c.surface },
  emptyBody: { ...t.subhead, fontFamily: serifItalic, color: c.ink3, paddingHorizontal: 20, paddingTop: 20 },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
  },
  tool: { minWidth: 34, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  toolText: { ...t.callout, color: c.ink },
});
