import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { c, mono, radius, serif, serifItalic, t } from '../theme';
import { GlassSurface, LIQUID_GLASS } from '../glass';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { deviceSalt } from '../db';
import { connect, disconnect, savedRepo, type Connection } from '../github';

/* ── Journal · Face ID ────────────────────────────────────────────────
 * The bug: authenticateAsync() defaults to `disableDeviceFallback: false`,
 * which maps to LAPolicyDeviceOwnerAuthentication — biometrics OR passcode, and
 * iOS often goes straight to the passcode sheet. Passing `disableDeviceFallback:
 * true` selects LAPolicyDeviceOwnerAuthenticationWithBiometrics, which is a real
 * Face ID prompt and nothing else.
 */
export function JournalScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useBottomInset();

  const unlock = async () => {
    setErr(null);
    if (Platform.OS === 'web') {
      setErr('Face ID needs the real device — the browser preview has no biometrics.');
      return;
    }
    setBusy(true);
    try {
      const LA = await import('expo-local-authentication');

      if (!(await LA.hasHardwareAsync())) {
        setErr('This device has no biometric hardware.');
        return;
      }
      const types = await LA.supportedAuthenticationTypesAsync();
      const hasFace = types.includes(LA.AuthenticationType.FACIAL_RECOGNITION);
      if (!(await LA.isEnrolledAsync())) {
        setErr(
          hasFace
            ? 'Face ID exists but no face is enrolled. Settings › Face ID & Passcode.'
            : 'No biometrics enrolled on this device.',
        );
        return;
      }

      const res = await LA.authenticateAsync({
        promptMessage: 'Unlock your journal',
        cancelLabel: 'Cancel',
        // Biometrics only — never silently degrade to the passcode sheet.
        disableDeviceFallback: true,
      });

      if (res.success) setUnlocked(true);
      else if (res.error === 'user_cancel' || res.error === 'system_cancel') setErr(null);
      else if (res.error === 'lockout')
        setErr('Too many failed attempts. Lock and unlock your phone, then retry.');
      else if (res.error === 'not_enrolled') setErr('No face enrolled. Settings › Face ID & Passcode.');
      else setErr('Face ID did not match.');
    } catch {
      setErr('Biometrics unavailable in this runtime.');
    } finally {
      setBusy(false);
    }
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
          <GlassSurface style={st.lockCard} fallbackColor={c.surface}>
            <Ionicons name="lock-closed-outline" size={26} color={c.ink3} />
            <Text style={st.lockedTitle}>The journal is locked.</Text>
            <Text style={st.lockedHint}>Only you can open it. Nothing here ever leaves the device unencrypted.</Text>
            <Pressable
              onPress={unlock}
              disabled={busy}
              style={({ pressed }) => [st.primaryBtn, (pressed || busy) && { opacity: 0.7 }]}
            >
              {busy ? (
                <ActivityIndicator color={c.bg} size="small" />
              ) : (
                <>
                  <Ionicons name="scan-outline" size={16} color={c.bg} />
                  <Text style={st.primaryText}>Unlock with Face ID</Text>
                </>
              )}
            </Pressable>
            {err ? <Text style={st.err}>{err}</Text> : null}
          </GlassSurface>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── Settings · GitHub ───────────────────────────────────────────────── */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const bottom = useBottomInset();
  const [repo, setRepo] = useState('');
  const [tok, setTok] = useState('');
  const [conn, setConn] = useState<Connection | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void savedRepo().then(setLinked);
  }, []);

  const doConnect = async () => {
    setBusy(true);
    setErr(null);
    const res = await connect(tok, repo);
    setBusy(false);
    if (res.ok) {
      setConn(res.connection);
      setLinked(res.connection.repo);
      setTok('');
    } else {
      setErr(res.error);
    }
  };

  const doDisconnect = async () => {
    await disconnect();
    setConn(null);
    setLinked(null);
  };

  const connected = conn ?? (linked ? null : null);
  const isLinked = !!conn || !!linked;

  return (
    <Screen>
      <LargeTitle kicker="local-first" title="Settings" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={st.kicker}>VAULT</Text>
          <View style={{ marginTop: 6 }}>
            <Row label="Storage" value={Platform.OS === 'web' ? 'memory (preview)' : 'sqlite'} />
            <Row label="Device id" value={deviceSalt()} />
            <Row label="Liquid Glass" value={LIQUID_GLASS ? 'on (iOS 26)' : 'unavailable — using blur'} />
          </View>
          <Text style={st.note}>The device id salts every note id, so two devices can never mint the same one.</Text>
        </Card>

        <Card>
          <Text style={st.kicker}>SYNC · GITHUB</Text>

          {isLinked ? (
            <>
              <Text style={st.connected}>
                Linked to <Text style={{ fontFamily: mono, color: c.ink }}>{conn?.repo ?? linked}</Text>
              </Text>
              {conn ? (
                <Text style={st.note}>
                  {conn.isPrivate ? 'Private repo' : '⚠ PUBLIC repo — your notes would be world-readable'} ·{' '}
                  {conn.biometricLock ? 'token sealed behind Face ID' : 'token stored without a biometric lock'}
                </Text>
              ) : (
                <Text style={st.note}>Token is in the Keychain. Reading it will prompt for Face ID.</Text>
              )}
              <Pressable onPress={doDisconnect} style={({ pressed }) => [st.ghostBtn, pressed && { opacity: 0.6 }]}>
                <Text style={st.ghostText}>Disconnect</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={st.body}>
                A fine-grained token scoped to one private repo. It is checked against GitHub before it is saved, then
                sealed in the Keychain behind Face ID.
              </Text>

              <TextInput
                value={repo}
                onChangeText={setRepo}
                placeholder="owner/repo"
                placeholderTextColor={c.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={st.input}
              />
              <TextInput
                value={tok}
                onChangeText={setTok}
                placeholder="github_pat_…"
                placeholderTextColor={c.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={st.input}
              />

              <Pressable
                onPress={doConnect}
                disabled={busy || !repo || !tok}
                style={({ pressed }) => [
                  st.primaryBtn,
                  { marginTop: 12 },
                  (busy || !repo || !tok) && { opacity: 0.35 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={c.bg} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-github" size={15} color={c.bg} />
                    <Text style={st.primaryText}>Connect private repo</Text>
                  </>
                )}
              </Pressable>

              {err ? <Text style={st.err}>{err}</Text> : null}
              <Text style={st.note}>
                Needs Contents: read & write. Pushing notes, the encrypted journal and the review ledger comes next —
                this step only proves the token works.
              </Text>
            </>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  kicker: { ...t.caption2, fontFamily: mono, letterSpacing: 1.6, color: c.ink3 },
  body: { ...t.footnote, color: c.ink2, lineHeight: 19, marginTop: 8 },
  note: { ...t.caption1, color: c.ink3, lineHeight: 17, marginTop: 12 },
  connected: { ...t.subhead, color: c.ink2, marginTop: 10 },

  lockCard: {
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    overflow: 'hidden',
  },
  lockedTitle: { ...t.title3, fontFamily: serif, fontWeight: undefined, color: c.ink, marginTop: 12 },
  lockedHint: { ...t.footnote, color: c.ink2, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.ink,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 18,
    alignSelf: 'stretch',
    minHeight: 46,
  },
  primaryText: { ...t.footnote, fontWeight: '600', color: c.bg },
  ghostBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  ghostText: { ...t.footnote, fontWeight: '600', color: c.red },

  input: {
    ...t.callout,
    fontFamily: mono,
    color: c.ink,
    backgroundColor: c.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 10,
  },

  err: { ...t.caption1, fontFamily: serifItalic, color: c.red, marginTop: 12, textAlign: 'center', lineHeight: 17 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.line,
    gap: 12,
  },
  rowLabel: { ...t.subhead, color: c.ink2 },
  rowValue: { ...t.subhead, fontFamily: mono, color: c.ink, flexShrink: 1 },
});
