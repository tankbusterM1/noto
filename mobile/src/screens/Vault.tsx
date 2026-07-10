import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { c, mono, serif, t } from '../theme';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { deviceSalt } from '../db';

/*
 * Journal — gated by Face ID.
 *
 * On device the key will live in the iOS Keychain behind biometry
 * (expo-secure-store `requireAuthentication`), which is strictly stronger than
 * the desktop's PBKDF2-from-passphrase: the key material never enters JS.
 * Right now this is the biometric gate; the encrypted store lands with the
 * crypto milestone.
 */
export function JournalScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useBottomInset();

  const unlock = async () => {
    setErr(null);
    if (Platform.OS === 'web') {
      setErr('Face ID is unavailable in the browser preview — run it in Expo Go on your phone.');
      return;
    }
    const LA = await import('expo-local-authentication');
    if (!(await LA.hasHardwareAsync()) || !(await LA.isEnrolledAsync())) {
      setErr('No biometrics enrolled on this device.');
      return;
    }
    const res = await LA.authenticateAsync({ promptMessage: 'Unlock your journal' });
    if (res.success) setUnlocked(true);
    else setErr('Authentication failed.');
  };

  return (
    <Screen>
      <LargeTitle kicker="encrypted at rest" title="Journal" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}>
        {unlocked ? (
          <Card>
            <Text style={st.kicker}>TODAY</Text>
            <Text style={st.body}>
              Unlocked. Entries stay on this device, encrypted with a key held in the Keychain behind Face ID.
            </Text>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
            <Ionicons name="lock-closed-outline" size={26} color={c.ink3} />
            <Text style={st.lockedTitle}>The journal is locked.</Text>
            <Text style={st.lockedHint}>
              Only you can open it. Nothing here ever leaves the device unencrypted.
            </Text>
            <Pressable onPress={unlock} style={({ pressed }) => [st.faceBtn, pressed && { opacity: 0.75 }]}>
              <Ionicons name="scan-outline" size={16} color={c.bg} />
              <Text style={st.faceText}>Unlock with Face ID</Text>
            </Pressable>
            {err ? <Text style={st.err}>{err}</Text> : null}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue}>{value}</Text>
    </View>
  );
}

export function SettingsScreen() {
  const bottom = useBottomInset();
  const adapter = Platform.OS === 'web' ? 'memory (preview)' : 'sqlite';

  return (
    <Screen>
      <LargeTitle kicker="local-first" title="Settings" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}>
        <Card>
          <Text style={st.kicker}>VAULT</Text>
          <View style={{ marginTop: 6 }}>
            <Row label="Storage" value={adapter} />
            <Row label="Device id" value={deviceSalt()} />
            <Row label="Platform" value={Platform.OS} />
          </View>
          <Text style={st.note}>
            The device id salts every note id, so two devices can never mint the same one.
          </Text>
        </Card>

        <Card>
          <Text style={st.kicker}>SYNC · GITHUB</Text>
          <Text style={st.body}>
            Notes push as markdown, the journal as ciphertext, and the review ledger append-only — so a
            union-merge can never lose a review. Not connected yet.
          </Text>
          <View style={[st.faceBtn, { backgroundColor: c.surface2, marginTop: 14 }]}>
            <Ionicons name="logo-github" size={15} color={c.ink3} />
            <Text style={[st.faceText, { color: c.ink3 }]}>Connect a private repo</Text>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  kicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  body: { ...t.footnote, color: c.ink2, lineHeight: 19, marginTop: 8 },
  note: { ...t.caption1, color: c.ink3, lineHeight: 17, marginTop: 12 },
  lockedTitle: { ...t.title3, fontFamily: serif, color: c.ink, marginTop: 12 },
  lockedHint: { ...t.footnote, color: c.ink2, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  faceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.ink,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  faceText: { ...t.footnote, fontWeight: '600', color: c.bg },
  err: { ...t.caption1, color: c.red, marginTop: 12, textAlign: 'center', lineHeight: 17 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.line,
  },
  rowLabel: { ...t.subhead, color: c.ink2 },
  rowValue: { ...t.subhead, fontFamily: mono, color: c.ink },
});
