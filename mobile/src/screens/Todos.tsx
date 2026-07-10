import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { c, mono, serifItalic, t } from '../theme';
import { haptics, Press, Rise } from '../motion';
import { LargeTitle, Screen, useBottomInset } from '../ui';
import { useData, type Todo } from '../store';
import type { TodayStackParamList } from '../navTypes';

function Row({ todo, index }: { todo: Todo; index: number }) {
  const toggle = useData((s) => s.toggleTodo);
  const remove = useData((s) => s.removeTodo);

  return (
    <Rise delay={Math.min(index, 8) * 22}>
      <View style={st.row}>
        <Press
          scaleTo={0.9}
          haptic={false}
          onPress={() => {
            // Completing is an outcome, not a tap: notify, don't buzz.
            if (!todo.done) haptics.success();
            else haptics.light();
            void toggle(todo.id);
          }}
          style={st.box}
        >
          <View style={[st.checkbox, todo.done && st.checkboxOn]}>
            {todo.done ? <Ionicons name="checkmark" size={14} color={c.bg} /> : null}
          </View>
        </Press>

        <View style={{ flex: 1 }}>
          <Text style={[st.text, todo.done && st.textDone]} numberOfLines={2}>
            {todo.text}
          </Text>
          {todo.tag ? <Text style={st.tag}>#{todo.tag}</Text> : null}
        </View>

        <Press
          scaleTo={0.85}
          haptic={false}
          hitSlop={10}
          onPress={() => {
            haptics.warning();
            void remove(todo.id);
          }}
          style={st.del}
        >
          <Ionicons name="close" size={16} color={c.ink3} />
        </Press>
      </View>
    </Rise>
  );
}

type Props = NativeStackScreenProps<TodayStackParamList, 'Todos'>;

export function TodosScreen({ navigation }: Props) {
  const todos = useData((s) => s.todos);
  const addTodo = useData((s) => s.addTodo);
  const bottom = useBottomInset();
  const [draft, setDraft] = useState('');

  const open = todos.filter((x) => !x.done).length;

  const submit = () => {
    if (!draft.trim()) return;
    haptics.light();
    void addTodo(draft);
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

      <LargeTitle kicker={`${open} open · ${todos.length - open} done`} title="Todos" />

      <View style={st.inputWrap}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder="Add a todo…  #tag"
          placeholderTextColor={c.ink3}
          style={st.input}
        />
      </View>

      <FlatList
        data={todos}
        keyExtractor={(x) => x.id}
        renderItem={({ item, index }) => <Row todo={item} index={index} />}
        ItemSeparatorComponent={() => <View style={st.sep} />}
        contentContainerStyle={{ paddingBottom: bottom }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={st.empty}>Nothing to do. Suspicious.</Text>}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { ...t.body, color: c.accent, marginLeft: 2 },

  inputWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  input: {
    ...t.body,
    color: c.ink,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  box: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.ink3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.green, borderColor: c.green },
  text: { ...t.body, color: c.ink },
  textDone: { color: c.ink3, textDecorationLine: 'line-through' },
  tag: { ...t.caption2, fontFamily: mono, color: c.amber, marginTop: 3 },
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 58 },
  empty: { ...t.subhead, fontFamily: serifItalic, color: c.ink3, textAlign: 'center', paddingTop: 40 },
});
