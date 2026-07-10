import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { c, mono, TAB_BAR_HEIGHT } from './src/theme';
import { useData } from './src/store';
import { NotesScreen, NoteScreen } from './src/screens/Notes';
import { TodayScreen } from './src/screens/Today';
import { ReviewScreen } from './src/screens/Review';
import { JournalScreen, SettingsScreen } from './src/screens/Vault';
import type { NotesStackParamList, TabParamList } from './src/navTypes';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** HIG: 3–5 tabs, filled glyph when selected, outline when not. */
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

const Stack = createNativeStackNavigator<NotesStackParamList>();

function NotesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="NotesList" component={NotesScreen} />
      <Stack.Screen name="Note" component={NoteScreen} />
    </Stack.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.amber,
        tabBarInactiveTintColor: c.ink3,
        // Translucent bar floating over content, the way iOS does it. Screens
        // pad their own bottom via useBottomInset() so nothing hides beneath it.
        tabBarStyle: {
          position: 'absolute',
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : c.surface,
          borderTopColor: c.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface }]} />
          ),
        tabBarLabel: LABELS[route.name],
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={ICONS[route.name][focused ? 1 : 0]} size={23} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="NotesTab" component={NotesStack} />
      <Tab.Screen name="Review" component={ReviewScreen} />
      <Tab.Screen name="Journal" component={JournalScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: c.bg,
    card: c.surface,
    text: c.ink,
    primary: c.amber,
    border: c.line,
    notification: c.red,
  },
};

function Boot() {
  const ready = useData((s) => s.ready);
  const hydrate = useData((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!ready) {
    return (
      <View style={st.boot}>
        <ActivityIndicator color={c.ink3} />
        <Text style={st.bootText}>OPENING THE VAULT…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Tabs />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Boot />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  boot: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bootText: { fontFamily: mono, fontSize: 10, letterSpacing: 2, color: c.ink3 },
});
