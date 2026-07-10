import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassGroup, GlassSurface } from './glass';
import { c, FLOAT_GAP, TAB_BAR_HEIGHT } from './theme';
import { useData } from './store';
import type { TabParamList } from './navTypes';

/*
 * The Liquid Glass floating tab bar (iOS 26 design language — Apple Music /
 * News / App Store anatomy):
 *
 *   · a detached PILL floating above the home indicator, inset from the screen
 *     edges, with content scrolling behind it — not an edge-to-edge bar;
 *   · a separate CIRCULAR accessory button beside it for the app's hero action
 *     (Music uses search; Noto's is "new note");
 *   · both live in one GlassGroup, so on real Liquid Glass (dev build, iOS 26)
 *     they SAMPLE AND MERGE like one fluid body when they touch. In Expo Go the
 *     effect API is absent, so the same layout renders on blur — the geometry
 *     is identical, only the material downgrades.
 *
 * Labels stay on the system font: tab bars are Apple chrome, and SF is what
 * belongs there; Noto's serif voice lives in the content, not the controls.
 */
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof TabParamList, [IconName, IconName]> = {
  Today: ['sunny-outline', 'sunny'],
  NotesTab: ['document-text-outline', 'document-text'],
  Review: ['albums-outline', 'albums'],
  Journal: ['book-outline', 'book'],
  Settings: ['settings-outline', 'settings'],
};

const LABELS: Record<keyof TabParamList, string> = {
  Today: 'Today',
  NotesTab: 'Notes',
  Review: 'Review',
  Journal: 'Journal',
  Settings: 'Settings',
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const createNote = useData((s) => s.createNote);

  const newNote = async () => {
    const id = await createNote();
    if (!id) return;
    navigation.navigate('NotesTab', { screen: 'Note', params: { id } });
  };

  return (
    <View
      pointerEvents="box-none"
      style={[st.wrap, { bottom: Math.max(insets.bottom, 12) + FLOAT_GAP }]}
    >
      <GlassGroup spacing={24} style={st.group}>
        {/* Shadow lives on the wrappers: the surfaces clip (overflow hidden for
            the radius), and a clipped view would swallow its own shadow. */}
        <View style={st.pillShadow}>
          <GlassSurface style={st.pill} interactive fallbackColor="rgba(250,248,242,0.94)">
            <View style={st.pillRow}>
              {state.routes.map((route, index) => {
                const focused = state.index === index;
                const name = route.name as keyof TabParamList;
                const [outline, filled] = ICONS[name] ?? ['ellipse-outline', 'ellipse'];
                const onPress = () => {
                  const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
                };
                const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    accessibilityRole="tab"
                    accessibilityState={focused ? { selected: true } : {}}
                    accessibilityLabel={LABELS[name] ?? route.name}
                    style={({ pressed }) => [st.item, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name={focused ? filled : outline} size={23} color={focused ? c.amber : c.ink3} />
                    <Text style={[st.label, focused && st.labelActive]} numberOfLines={1}>
                      {LABELS[name] ?? route.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassSurface>
        </View>

        <View style={st.circleShadow}>
          <GlassSurface style={st.circle} interactive fallbackColor="rgba(250,248,242,0.94)">
            <Pressable
              onPress={() => void newNote()}
              accessibilityRole="button"
              accessibilityLabel="New note"
              hitSlop={6}
              style={({ pressed }) => [st.circlePress, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="add" size={27} color={c.ink} />
            </Pressable>
          </GlassSurface>
        </View>
      </GlassGroup>
    </View>
  );
}

const R = TAB_BAR_HEIGHT / 2;

const shadow = {
  shadowColor: '#18130a',
  shadowOpacity: 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 12,
} as const;

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  pillShadow: { flex: 1, ...shadow },
  pill: {
    height: TAB_BAR_HEIGHT,
    borderRadius: R,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(227,221,207,0.85)',
  },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: '100%' },
  label: { fontSize: 10, fontWeight: '600', color: c.ink3 },
  labelActive: { color: c.amber, fontWeight: '700' },

  circleShadow: { ...shadow },
  circle: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: R,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(227,221,207,0.85)',
  },
  circlePress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
