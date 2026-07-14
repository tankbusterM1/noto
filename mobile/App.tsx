import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { c } from './src/theme';
import { useAppFonts } from './src/fonts';
import { Launch } from './src/Launch';
import { FloatingTabBar } from './src/FloatingTabBar';
import { useData } from './src/store';
import { initWidgetSync } from './src/widgetSync';
import { NotesScreen } from './src/screens/Notes';
import { NoteScreen } from './src/screens/Note';
import { TodayScreen } from './src/screens/Today';
import { TodosScreen } from './src/screens/Todos';
import { WatchScreen } from './src/screens/Watch';
import { BytesScreen } from './src/screens/Bytes';
import { ReviewScreen } from './src/screens/Review';
import { JournalScreen, SettingsScreen } from './src/screens/Vault';
import type { NotesStackParamList, TabParamList, TodayStackParamList } from './src/navTypes';

/** For deep links fired by the Live Activity buttons (noto://review, noto://done). */
const navRef = createNavigationContainerRef<TabParamList>();

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
      <TodayNav.Screen name="Bytes" component={BytesScreen} />
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
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        // Sections cross-shift in the direction of travel instead of hard-cutting
        // (then letting each screen's content roll up on its own). This is the
        // one built-in transition that reads as spatial, not a cheap slide-up.
        animation: 'shift',
      }}
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

function Boot() {
  const fontsReady = useAppFonts();
  const ready = useData((s) => s.ready);
  const hydrate = useData((s) => s.hydrate);
  const refreshSignals = useData((s) => s.refreshSignals);
  const [launchGone, setLaunchGone] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Mirror the vault into the iOS widgets once it's loaded (no-op off native iOS).
  useEffect(() => {
    if (!ready) return;
    return initWidgetSync();
  }, [ready]);

  // Re-badge on foreground: todos may have been completed on another device, and
  // the daily digest's body is frozen at schedule time, so it needs re-arming.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshSignals();
    });
    return () => sub.remove();
  }, [refreshSignals]);

  // The Live Activity buttons deep-link back in: "Review" jumps to the Review
  // tab; "Done" checks off the top open todo (the activity then updates itself
  // through the store subscription). Warm taps are the common case; a cold-start
  // "review" only navigates once the container is ready.
  useEffect(() => {
    const run = (url: string | null) => {
      if (!url || !url.startsWith('noto://')) return;
      if (url.includes('done')) {
        const st = useData.getState();
        const top = st.todos.find((x) => !x.done);
        if (top) void st.toggleTodo(top.id);
      } else if (url.includes('review') && navRef.isReady()) {
        navRef.navigate('Review');
      }
    };
    void Linking.getInitialURL().then(run);
    const sub = Linking.addEventListener('url', ({ url }) => run(url));
    return () => sub.remove();
  }, []);

  // The launch animation plays over a paper background and lifts away to reveal
  // the app, which mounts underneath the moment fonts + the vault are ready.
  // Until both are ready it holds on the settled mark — no font flash, no
  // half-mounted app. (This replaces the old text "booting" spinner.)
  const bootComplete = fontsReady && ready;

  return (
    <View style={st.root}>
      {bootComplete ? (
        <NavigationContainer ref={navRef} theme={navTheme}>
          <Tabs />
        </NavigationContainer>
      ) : null}
      {launchGone ? null : <Launch canLift={bootComplete} onDone={() => setLaunchGone(true)} />}
    </View>
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
  root: { flex: 1, backgroundColor: c.bg },
});
