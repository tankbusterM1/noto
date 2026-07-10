import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { c, mono, radius, serif, serifItalic, t } from '../theme';
import { GlassSurface, LIQUID_GLASS, glassDiagnostics } from '../glass';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { deviceSalt } from '../db';
import { connect, disconnect, savedRepo, type Connection } from '../github';

/**
 * Face ID is COMPILED INTO a binary, not requested at runtime: iOS only offers
 * the Face ID consent prompt to apps whose Info.plist carries
 * NSFaceIDUsageDescription. Expo Go's binary doesn't (expo/expo#21694), so
 * inside Expo Go the biometric policy fails before any UI — there is no
 * permission for the user OR the app to grant. iOS's stand-in is the passcode
 * sheet. Our app.json already configures faceIDPermission, so an installed
 * build of Noto gets the real prompt.
 */
const IN_EXPO_GO =
  Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/* ── Journal · Face ID ────────────────────────────────────────────────
 * Two bugs were stacked here.
 *
 * 1. authenticateAsync() defaults to disableDeviceFallback:false, i.e.
 *    LAPolicyDeviceOwnerAuthentication — biometrics OR passcode — and iOS often
 *    goes straight to the passcode sheet. We pass disableDeviceFallback:true
 *    (LAPolicyDeviceOwnerAuthenticationWithBiometrics): Face ID or nothing.
 *
 * 2. Every unmapped error was reported as "Face ID did not match", which is a
 *    lie when the prompt never even appeared. The usual real cause is that iOS
 *    denied the app permission to use Face ID (`not_available`) — it fails
 *    instantly, with no animation. Now we surface the actual code.
 */
interface Biometrics {
  hardware: boolean;
  enrolled: boolean;
  face: boolean;
  types: string;
}

export function JournalScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [bio, setBio] = useState<Biometrics | null>(null);
  const bottom = useBottomInset();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const LA = await import('expo-local-authentication');
      const types = await LA.supportedAuthenticationTypesAsync();
      setBio({
        hardware: await LA.hasHardwareAsync(),
        enrolled: await LA.isEnrolledAsync(),
        face: types.includes(LA.AuthenticationType.FACIAL_RECOGNITION),
        types:
          types
            .map((x) =>
              x === LA.AuthenticationType.FACIAL_RECOGNITION
                ? 'face'
                : x === LA.AuthenticationType.FINGERPRINT
                  ? 'touch'
                  : 'iris',
            )
            .join(', ') || 'none',
      });
    })();
  }, []);

  const run = async (biometricsOnly: boolean) => {
    setErr(null);
    setCode(null);
    if (Platform.OS === 'web') {
      setErr('Face ID needs the real device — the browser preview has no biometrics.');
      return;
    }
    setBusy(true);
    try {
      const LA = await import('expo-local-authentication');
      const res = await LA.authenticateAsync({
        promptMessage: 'Unlock your journal',
        cancelLabel: 'Cancel',
        disableDeviceFallback: biometricsOnly,
        ...(biometricsOnly ? {} : { fallbackLabel: 'Use passcode' }),
      });

      if (res.success) {
        setUnlocked(true);
        return;
      }

      const e = 'error' in res ? String(res.error) : 'unknown';
      setCode(e);

      switch (e) {
        case 'user_cancel':
        case 'system_cancel':
        case 'app_cancel':
          setErr(null);
          break;
        case 'not_available':
          setErr(
            'iOS refused Face ID for this app — nothing was ever shown. Open Settings › Expo Go and turn Face ID ON, then retry.',
          );
          break;
        case 'not_enrolled':
          setErr('No face is enrolled. Settings › Face ID & Passcode.');
          break;
        case 'passcode_not_set':
          setErr('Set a device passcode first; Face ID requires one.');
          break;
        case 'lockout':
          setErr('Too many failed attempts. Lock and unlock your phone, then retry.');
          break;
        case 'authentication_failed':
          setErr('Face ID ran but did not match.');
          break;
        default:
          setErr(`Face ID failed before it could run (${e}).`);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Biometrics unavailable in this runtime.');
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
              onPress={() => void run(!IN_EXPO_GO)}
              disabled={busy}
              style={({ pressed }) => [st.primaryBtn, (pressed || busy) && { opacity: 0.7 }]}
            >
              {busy ? (
                <ActivityIndicator color={c.bg} size="small" />
              ) : (
                <>
                  <Ionicons name={IN_EXPO_GO ? 'keypad-outline' : 'scan-outline'} size={16} color={c.bg} />
                  <Text style={st.primaryText}>{IN_EXPO_GO ? 'Unlock with passcode' : 'Unlock with Face ID'}</Text>
                </>
              )}
            </Pressable>

            {IN_EXPO_GO ? (
              <Text style={st.diag}>
                Expo Go can’t show Face ID — Apple bakes that permission into an app’s binary at build time, and Expo
                Go’s doesn’t carry it. The passcode sheet is iOS’s stand-in here; the installed build of Noto uses real
                Face ID.
              </Text>
            ) : null}

            {err ? <Text style={st.err}>{err}</Text> : null}

            {code && code !== 'user_cancel' ? (
              <>
                <Text style={st.diag}>error code: {code}</Text>
                {!IN_EXPO_GO ? (
                  <Pressable onPress={() => void run(false)} style={({ pressed }) => [st.ghostBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={st.ghostTextMuted}>Use passcode instead</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {bio ? (
              <Text style={st.diag}>
                {IN_EXPO_GO ? 'expo go · ' : 'dev build · '}hardware {bio.hardware ? 'yes' : 'no'} · enrolled{' '}
                {bio.enrolled ? 'yes' : 'no'} · {bio.types}
              </Text>
            ) : null}
          </GlassSurface>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────── */
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

  const g = glassDiagnostics();

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
            <Row label="Runtime" value={Platform.OS === 'web' ? 'browser preview' : IN_EXPO_GO ? 'Expo Go' : 'dev build'} />
          </View>
          <Text style={st.note}>The device id salts every note id, so two devices can never mint the same one.</Text>
        </Card>

        <Card glass>
          <Text style={st.kicker}>LIQUID GLASS</Text>
          <View style={{ marginTop: 6 }}>
            <Row label="Status" value={LIQUID_GLASS ? 'active' : 'falling back to blur'} />
            <Row label="iOS version" value={g.osVersion} />
            <Row label="Module loaded" value={g.moduleLoaded ? 'yes' : 'no'} />
            <Row label="Design adopted" value={g.designAdopted ? 'yes' : 'no'} />
            <Row label="Effect API (the gate)" value={g.effectApi ? 'present' : 'absent'} />
          </View>
          <Text style={st.note}>
            {LIQUID_GLASS
              ? 'Real UIGlassEffect on the tab bar, the editor toolbar and this card.'
              : g.designAdopted
                ? 'iOS 26 adopts the Liquid Glass design, but UIGlassEffect is absent at runtime — this binary (Expo Go) was compiled against a pre-iOS-26 SDK, so the effect is not linked in. A development build enables it. Rendering blur instead.'
                : 'Liquid Glass needs iOS 26. Below that, the material does not exist and we render the pre-26 blur.'}
            {g.loadError ? ` (module error: ${g.loadError})` : ''}
          </Text>
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
                Needs Contents: read &amp; write. Pushing notes, the encrypted journal and the review ledger comes next —
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
  diag: { ...t.caption2, fontFamily: mono, color: c.ink3, marginTop: 10, textAlign: 'center' },

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
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'stretch',
  },
  ghostText: { ...t.footnote, fontWeight: '600', color: c.red },
  ghostTextMuted: { ...t.footnote, fontWeight: '600', color: c.ink2 },

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
