import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GlassGroup, GlassSurface } from './glass';
import { haptics, PRESS_IN, SPRING } from './motion';
import { c, FLOAT_GAP, TAB_BAR_HEIGHT } from './theme';
import { useData } from './store';
import type { TabParamList } from './navTypes';

/*
 * The Liquid Glass floating tab bar (iOS 26 anatomy — Apple Music / News):
 *
 *   · a detached PILL floating above the home indicator, inset from the edges,
 *     with content scrolling behind it;
 *   · a separate CIRCULAR accessory button for the hero action (new note);
 *   · both in one GlassGroup so real Liquid Glass makes them sample and merge.
 *
 * Motion: a spring-driven capsule slides under the active tab (the thing that
 * makes it feel alive), icons spring on press and lift when selected, and every
 * tap carries a light haptic. All of it runs on the UI thread via worklets.
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

const ROW_PAD = 6;
/** Must match st.wrap / st.group below — the pill's width is derived from these. */
const EDGE = 14;
/**
 * Gap between the pill and the accessory circle. Must stay LARGER than
 * GLASS_MERGE_AT, or GlassContainer fuses them into one blob with an ugly
 * concave seam (what shipped: gap 10 vs merge threshold 24). Apple keeps them
 * as two distinct bodies — Music, News, App Store all do.
 */
const GAP = 12;
const GLASS_MERGE_AT = 0;

function TabItem({
  name,
  focused,
  onPress,
  onLongPress,
}: {
  name: keyof TabParamList;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const press = useSharedValue(1);
  const lift = useSharedValue(focused ? 1 : 0);
  const [outline, filled] = ICONS[name] ?? (['ellipse-outline', 'ellipse'] as [IconName, IconName]);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, lift]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * (1 + lift.value * 0.1) }, { translateY: -lift.value * 1.5 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={LABELS[name] ?? name}
      onPressIn={() => {
        press.value = withSpring(0.86, PRESS_IN);
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
      onPress={() => {
        // selectionAsync is the crisp UIKit "moved between segments" tick —
        // an impact buzz for navigation feels heavy-handed.
        if (!focused) haptics.selection();
        onPress();
      }}
      onLongPress={onLongPress}
      style={st.item}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? filled : outline} size={23} color={focused ? c.amber : c.ink3} />
      </Animated.View>
      <Text style={[st.label, focused && st.labelActive]} numberOfLines={1}>
        {LABELS[name] ?? name}
      </Text>
    </Pressable>
  );
}

function NewNoteButton({ onPress }: { onPress: () => void }) {
  const press = useSharedValue(1);
  const spin = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }, { rotate: `${spin.value}deg` }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New note"
      hitSlop={6}
      onPressIn={() => {
        press.value = withSpring(0.88, PRESS_IN);
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
      onPress={() => {
        haptics.medium();
        spin.value = withSequence(withTiming(90, { duration: 180 }), withTiming(0, { duration: 0 }));
        onPress();
      }}
      style={st.circlePress}
    >
      <Animated.View style={style}>
        <Ionicons name="add" size={27} color={c.ink} />
      </Animated.View>
    </Pressable>
  );
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const createNote = useData((s) => s.createNote);
  const { width: screenW } = useWindowDimensions();

  const count = state.routes.length;
  // Derived, not measured. onLayout gave 0 on first paint and the indicator
  // never mounted; the pill's width is fully determined by the layout constants
  // (screen − side insets − gap − circle), so compute it and skip the round trip.
  const pillW = screenW - EDGE * 2 - GAP - TAB_BAR_HEIGHT;
  const itemW = Math.max(0, (pillW - ROW_PAD * 2) / count);

  const idx = useSharedValue(state.index);
  useEffect(() => {
    idx.value = withSpring(state.index, SPRING);
  }, [state.index, idx]);

  // The capsule that slides under the active tab.
  const indicator = useAnimatedStyle(() => ({
    width: itemW,
    transform: [{ translateX: ROW_PAD + idx.value * itemW }],
  }));

  const newNote = async () => {
    const id = await createNote();
    if (!id) return;
    navigation.navigate('NotesTab', { screen: 'Note', params: { id } });
  };

  return (
    <View pointerEvents="box-none" style={[st.wrap, { bottom: Math.max(insets.bottom, 12) + FLOAT_GAP }]}>
      <GlassGroup spacing={GLASS_MERGE_AT} style={st.group}>
        {/* Shadow lives on the un-clipped wrapper: the glass surface clips for
            its radius, and a clipped view swallows its own shadow. */}
        <View style={st.pillShadow}>
          <GlassSurface style={st.pill} interactive fallbackColor="rgba(250,248,242,0.94)">
            <View style={st.pillRow}>
              {itemW > 0 ? <Animated.View style={[st.indicator, indicator]} /> : null}
              {state.routes.map((route, index) => (
                <TabItem
                  key={route.key}
                  name={route.name as keyof TabParamList}
                  focused={state.index === index}
                  onPress={() => {
                    const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (state.index !== index && !e.defaultPrevented) navigation.navigate(route.name, route.params);
                  }}
                  onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                />
              ))}
            </View>
          </GlassSurface>
        </View>

        <View style={st.circleShadow}>
          <GlassSurface style={st.circle} interactive fallbackColor="rgba(250,248,242,0.94)">
            <NewNoteButton onPress={() => void newNote()} />
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
  pillRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_PAD },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 7,
    bottom: 7,
    borderRadius: 24,
    backgroundColor: 'rgba(184,122,38,0.13)',
    pointerEvents: 'none',
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
