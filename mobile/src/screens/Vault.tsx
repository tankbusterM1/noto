import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { c, mono, radius, serif, serifItalic, t } from '../theme';
import { GlassSurface, LIQUID_GLASS, glassDiagnostics } from '../glass';
import { Card, LargeTitle, Screen, useBottomInset } from '../ui';
import { haptics, Press, Rise } from '../motion';
import { deviceSalt } from '../db';
import { useData } from '../store';
import { connect, createPrivateRepo, disconnect, savedRepo, type Connection } from '../github';

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
  const unlocked = useData((s) => s.journalUnlocked);
  const entries = useData((s) => s.journal);
  const sealedCount = useData((s) => s.journalCount);
  const unlockJournal = useData((s) => s.unlockJournal);
  const lockJournal = useData((s) => s.lockJournal);
  const addEntry = useData((s) => s.addJournalEntry);
  const removeEntry = useData((s) => s.removeJournalEntry);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [bio, setBio] = useState<Biometrics | null>(null);
  const [draft, setDraft] = useState('');
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

  /*
   * One prompt, not two. Reading the Keychain key is itself the Face ID
   * challenge (the item carries a biometric ACL), so calling
   * LocalAuthentication first would show the sheet twice for one unlock.
   * expo-local-authentication is kept only for the capability read-out below.
   */
  const run = async () => {
    setErr(null);
    setCode(null);
    if (Platform.OS === 'web') {
      setErr('Face ID needs the real device — the browser preview has no Keychain.');
      return;
    }
    setBusy(true);
    try {
      if (await unlockJournal()) {
        haptics.success();
        return;
      }
      haptics.error();
      setCode('keychain_unlock_failed');
      if (bio && !bio.hardware) setErr('This device has no biometric hardware.');
      else if (bio && !bio.enrolled) setErr('No face is enrolled. Settings › Face ID & Passcode.');
      else setErr('Cancelled, or Face ID could not release the key.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Keychain unavailable in this runtime.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    await addEntry(draft);
    setDraft('');
    haptics.success();
  };

  return (
    <Screen>
      <LargeTitle
        kicker={unlocked ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : 'encrypted at rest'}
        title="Journal"
        trailing={
          unlocked ? (
            <Press
              scaleTo={0.88}
              haptic={false}
              onPress={() => {
                haptics.light();
                lockJournal();
              }}
              style={st.lockBtn}
            >
              <Ionicons name="lock-closed" size={16} color={c.bg} />
            </Press>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {unlocked ? (
          <>
            <Card>
              <Text style={st.kicker}>TODAY</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                textAlignVertical="top"
                placeholder="Write it down. Nobody else can read this."
                placeholderTextColor={c.ink3}
                style={st.composer}
              />
              <Pressable
                onPress={() => void save()}
                disabled={!draft.trim()}
                style={({ pressed }) => [st.primaryBtn, !draft.trim() && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="lock-closed-outline" size={15} color={c.bg} />
                <Text style={st.primaryText}>Seal this entry</Text>
              </Pressable>
            </Card>

            {entries.map((e, i) => (
              <Rise key={e.id} delay={Math.min(i, 8) * 22}>
                <Card>
                  <View style={st.entryHead}>
                    <Text style={st.kicker}>
                      {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                      {e.words} {e.words === 1 ? 'WORD' : 'WORDS'}
                    </Text>
                    <Press
                      scaleTo={0.85}
                      haptic={false}
                      hitSlop={10}
                      onPress={() => {
                        haptics.warning();
                        void removeEntry(e.id);
                      }}
                    >
                      <Ionicons name="close" size={15} color={c.ink3} />
                    </Press>
                  </View>
                  <Text style={st.entryText}>{e.text}</Text>
                </Card>
              </Rise>
            ))}

            {entries.length === 0 ? <Text style={st.emptyJournal}>Nothing written yet.</Text> : null}
          </>
        ) : (
          <GlassSurface style={st.lockCard} fallbackColor={c.surface}>
            <Ionicons name="lock-closed-outline" size={26} color={c.ink3} />
            <Text style={st.lockedTitle}>The journal is locked.</Text>
            <Text style={st.lockedHint}>
              {sealedCount > 0
                ? `${sealedCount} sealed ${sealedCount === 1 ? 'entry' : 'entries'}. Without your face they are noise — even to this app.`
                : 'Only you can open it. Nothing here ever leaves the device unencrypted.'}
            </Text>

            <Pressable
              onPress={() => void run()}
              disabled={busy}
              style={({ pressed }) => [st.primaryBtn, (pressed || busy) && { opacity: 0.7 }]}
            >
              {busy ? (
                <ActivityIndicator color={c.bg} size="small" />
              ) : (
                <>
                  <Ionicons name={IN_EXPO_GO ? 'keypad-outline' : 'scan-outline'} size={16} color={c.bg} />
                  <Text style={st.primaryText}>{IN_EXPO_GO ? 'Unlock' : 'Unlock with Face ID'}</Text>
                </>
              )}
            </Pressable>

            {IN_EXPO_GO ? (
              <Text style={st.diag}>
                Expo Go can’t show Face ID — Apple bakes that permission into an app’s binary at build time, and Expo
                Go’s doesn’t carry it. Here the key is stored without a biometric lock; the installed build seals it
                behind Face ID.
              </Text>
            ) : null}

            {err ? <Text style={st.err}>{err}</Text> : null}
            {code && code !== 'user_cancel' ? <Text style={st.diag}>error code: {code}</Text> : null}

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
  const todos = useData((s) => s.todos);
  const digestOn = useData((s) => s.digestOn);
  const setDigest = useData((s) => s.setDigest);
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

  const finish = (res: Awaited<ReturnType<typeof connect>>) => {
    setBusy(false);
    if (res.ok) {
      haptics.success();
      setConn(res.connection);
      setLinked(res.connection.repo);
      setTok('');
    } else {
      haptics.error();
      setErr(res.error);
    }
  };

  const doConnect = async () => {
    setBusy(true);
    setErr(null);
    finish(await connect(tok, repo));
  };

  /** One tap: make the private repo for them, no trip to github.com. */
  const doCreate = async () => {
    setBusy(true);
    setErr(null);
    finish(await createPrivateRepo(tok));
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

        <Card>
          <Text style={st.kicker}>HOME SCREEN</Text>
          <View style={st.switchRow}>
            <View style={{ flex: 1, paddingRight: 14 }}>
              <Text style={st.rowLabel}>Daily digest</Text>
              <Text style={st.note}>
                A 9am reminder naming what&apos;s waiting. The app icon always carries the open-todo count
                {todos.filter((t) => !t.done).length > 0 ? ` (${todos.filter((t) => !t.done).length} now)` : ''}.
              </Text>
            </View>
            <Switch
              value={digestOn}
              onValueChange={(v) => {
                haptics.selection();
                void setDigest(v);
              }}
              trackColor={{ true: c.amber, false: c.line }}
            />
          </View>
          <Text style={st.note}>
            A real WidgetKit widget needs an App Group, which Apple does not grant to free personal teams — that one
            costs $99/yr. The badge and this reminder need no entitlement at all.
          </Text>
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
                onPress={doCreate}
                disabled={busy || !tok}
                style={({ pressed }) => [
                  st.primaryBtn,
                  { marginTop: 12 },
                  (busy || !tok) && { opacity: 0.35 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={c.bg} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-github" size={15} color={c.bg} />
                    <Text style={st.primaryText}>Create private vault repo</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={doConnect}
                disabled={busy || !repo || !tok}
                style={({ pressed }) => [st.ghostBtn, (busy || !repo || !tok) && { opacity: 0.35 }, pressed && { opacity: 0.6 }]}
              >
                <Text style={st.ghostTextMuted}>Or link the repo above</Text>
              </Pressable>

              {err ? <Text style={st.err}>{err}</Text> : null}
              <Text style={st.note}>
                Create makes a private <Text style={{ fontFamily: mono }}>noto-vault</Text> for you — no trip to
                github.com. Needs Contents + Administration: read &amp; write. Pushing notes, the encrypted journal and
                the review ledger comes next; this step only proves the token works.
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
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },

  lockBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    ...t.body,
    fontFamily: serif,
    color: c.ink,
    lineHeight: 26,
    minHeight: 120,
    marginTop: 10,
    paddingTop: 0,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryText: { ...t.body, fontFamily: serif, color: c.ink, lineHeight: 26, marginTop: 10 },
  emptyJournal: { ...t.subhead, fontFamily: serifItalic, color: c.ink3, textAlign: 'center', paddingTop: 24 },
});
