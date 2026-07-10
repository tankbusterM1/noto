import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { c } from './src/theme';
import { useAppFonts } from './src/fonts';
import { FloatingTabBar } from './src/FloatingTabBar';
import { useData } from './src/store';
import { NotesScreen } from './src/screens/Notes';
import { NoteScreen } from './src/screens/Note';
import { TodayScreen } from './src/screens/Today';
import { TodosScreen } from './src/screens/Todos';
import { WatchScreen } from './src/screens/Watch';
import { ReviewScreen } from './src/screens/Review';
import { JournalScreen, SettingsScreen } from './src/screens/Vault';
import type { NotesStackParamList, TabParamList, TodayStackParamList } from './src/navTypes';

const stackOptions = { headerShown: false, contentStyle: { backgroundColor: c.bg } } as const;

const Stack = createNativeStackNavigator<NotesStackParamList>();

function NotesStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="NotesList" component={NotesScreen} />
      <Stack.Screen name="Note" component={NoteScreen} />
    </Stack.Navigator>
  );
}

const TodayNav = createNativeStackNavigator<TodayStackParamList>();

/** Todos + Watch Later push from Today — the tab bar is full at Apple's five. */
function TodayStack() {
  return (
    <TodayNav.Navigator screenOptions={stackOptions}>
      <TodayNav.Screen name="TodayHome" component={TodayScreen} />
      <TodayNav.Screen name="Todos" component={TodosScreen} />
      <TodayNav.Screen name="Watch" component={WatchScreen} />
    </TodayNav.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * The tab bar is the custom Liquid Glass floating pill (src/FloatingTabBar) —
 * a detached pill + circular "new note" accessory, per the iOS 26 design
 * language. Screens keep their own bottom padding via useBottomInset(), since
 * content scrolls behind the floating bar.
 */
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tab.Screen name="Today" component={TodayStack} />
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

function Booting({ label }: { label: string }) {
  return (
    <View style={st.boot}>
      <ActivityIndicator color={c.ink3} />
      <Text style={st.bootText}>{label}</Text>
    </View>
  );
}

function Boot() {
  const fontsReady = useAppFonts();
  const ready = useData((s) => s.ready);
  const hydrate = useData((s) => s.hydrate);
  const refreshSignals = useData((s) => s.refreshSignals);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Re-badge on foreground: todos may have been completed on another device, and
  // the daily digest's body is frozen at schedule time, so it needs re-arming.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshSignals();
    });
    return () => sub.remove();
  }, [refreshSignals]);

  // Render nothing typographic until Newsreader/JetBrains Mono land, or the
  // first frame flashes in the system font and reflows.
  if (!fontsReady) return <Booting label="SETTING THE TYPE…" />;
  if (!ready) return <Booting label="OPENING THE VAULT…" />;

  return (
    <NavigationContainer theme={navTheme}>
      <Tabs />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/*
        Reanimated disables animations whenever the OS reports reduce-motion,
        warning only in dev. That ambient kill switch is exactly what gutted the
        desktop app's motion once before. Motion here is part of the design, so
        we opt out globally; if it ever needs reducing it becomes a real setting.
      */}
      <ReducedMotionConfig mode={ReduceMotion.Never} />
      <Boot />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  boot: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bootText: { fontSize: 10, letterSpacing: 2, color: c.ink3 },
});
