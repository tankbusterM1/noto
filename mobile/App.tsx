import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { ReviewScreen } from './src/screens/Review';
import { JournalScreen, SettingsScreen } from './src/screens/Vault';
import type { NotesStackParamList, TabParamList } from './src/navTypes';

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

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
      <Boot />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  boot: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bootText: { fontSize: 10, letterSpacing: 2, color: c.ink3 },
});
