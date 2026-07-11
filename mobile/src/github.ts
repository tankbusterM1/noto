import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/*
 * GitHub connection.
 *
 * The token lives in the iOS Keychain as `WHEN_UNLOCKED_THIS_DEVICE_ONLY` —
 * device-bound, kept out of iCloud/iTunes backups, readable only while the phone
 * is unlocked. It is deliberately NOT behind a per-read Face ID prompt: auto-sync
 * runs in the background as you work, and a token that demanded biometrics on
 * every read would fire Face ID at random.
 *
 * Be honest about what that token can reach, because the code does not narrow it:
 *   · Its blast radius is exactly the scope of whatever token was pasted/granted.
 *     The one-tap device-flow sign-in requests the `repo` scope (see githubAuth),
 *     which is read/write to EVERY repo the account owns. A fine-grained token
 *     scoped to the single vault repo is far tighter — prefer it if you can.
 *   · The vault repo is NOT end-to-end encrypted except for the journal. Notes,
 *     todos, tags, folders and the whole review history sit in the repo as
 *     PLAINTEXT (see src/lib/sync.ts). Only `journal/*` is ciphertext, and its
 *     passphrase never leaves the device. So a stolen token can read your notes;
 *     it cannot read your journal.
 *
 * Net: the journal stays private under any token theft; everything else is only
 * as private as the repo and the token's scope. Auto-sync trades a per-read Face
 * ID prompt for that reality — an acceptable trade for a device-bound token, but
 * not a claim that the token is harmless.
 *
 * We validate before saving — a token that can't actually reach the repo is
 * worse than no token, because it fails at sync time instead of setup time.
 */

const TOKEN_KEY = 'noto_github_pat';
const REPO_KEY = 'noto_github_repo';

export interface Connection {
  login: string;
  repo: string;
  isPrivate: boolean;
  /** False when the device couldn't give us a biometric-gated keychain slot. */
  biometricLock: boolean;
}

export type ConnectResult = { ok: true; connection: Connection } | { ok: false; error: string };

const api = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

/** Browser preview has no Keychain; keep it working without pretending it's secure. */
const memory = new Map<string, string>();
const webFallback = Platform.OS === 'web';

async function setItem(key: string, value: string, biometric: boolean): Promise<boolean> {
  if (webFallback) {
    memory.set(key, value);
    return false;
  }
  if (biometric) {
    try {
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: true,
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return true;
    } catch {
      // No passcode/biometry enrolled, or Expo Go refused the ACL. Fall through.
    }
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return false;
}

async function getItem(key: string): Promise<string | null> {
  if (webFallback) return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function delItem(key: string): Promise<void> {
  if (webFallback) {
    memory.delete(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* already gone */
  }
}

/** `owner/repo` -> verify the token can actually see it. */
export async function connect(token: string, repoFullName: string): Promise<ConnectResult> {
  const trimmedToken = token.trim();
  const typed = repoFullName.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');

  if (!trimmedToken) return { ok: false, error: 'Paste a token first.' };
  if (!/^([\w.-]+\/)?[\w.-]+$/.test(typed) || /(^|\/)\.+$/.test(typed)) {
    return { ok: false, error: 'That is not a repo name.' };
  }

  let user: { login: string };
  try {
    const res = await fetch('https://api.github.com/user', { headers: api(trimmedToken) });
    if (res.status === 401) return { ok: false, error: 'GitHub rejected the token (401). Is it expired?' };
    if (!res.ok) return { ok: false, error: `GitHub said ${res.status} when checking the token.` };
    user = (await res.json()) as { login: string };
  } catch {
    return { ok: false, error: 'No network. GitHub is unreachable.' };
  }

  // A bare name is the common case now — the owner is whoever the token belongs to.
  const repo = typed.includes('/') ? typed : `${user.login}/${typed}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: api(trimmedToken) });
    if (res.status === 404) {
      return { ok: false, error: `Can't see ${repo}. Either it doesn't exist or the token lacks access to it.` };
    }
    if (!res.ok) return { ok: false, error: `GitHub said ${res.status} when checking the repo.` };
    const meta = (await res.json()) as { full_name: string; private: boolean; permissions?: { push?: boolean } };

    if (meta.permissions && meta.permissions.push !== true) {
      return { ok: false, error: 'That token is read-only. Sync needs write (Contents: read & write).' };
    }

    const biometricLock = await setItem(TOKEN_KEY, trimmedToken, false);
    await setItem(REPO_KEY, meta.full_name, false);

    return {
      ok: true,
      connection: { login: user.login, repo: meta.full_name, isPrivate: meta.private, biometricLock },
    };
  } catch {
    return { ok: false, error: 'No network. GitHub is unreachable.' };
  }
}

/**
 * Create the private vault repo for the user, so they never touch github.com.
 * `auto_init: false` keeps it empty — an initial commit would force a merge on
 * the first sync push.
 */
export async function createPrivateRepo(tokenValue: string, name: string): Promise<ConnectResult> {
  const tok = tokenValue.trim();
  if (!tok) return { ok: false, error: 'Paste a token first.' };
  // No default: a guessed repo name is a write to somewhere nobody asked for.
  if (!name) return { ok: false, error: 'Name the repo to sync into first.' };

  let login: string;
  try {
    const me = await fetch('https://api.github.com/user', { headers: api(tok) });
    if (me.status === 401) return { ok: false, error: 'GitHub rejected the token (401).' };
    if (!me.ok) return { ok: false, error: `GitHub said ${me.status}.` };
    login = ((await me.json()) as { login: string }).login;
  } catch {
    return { ok: false, error: 'No network. GitHub is unreachable.' };
  }

  try {
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { ...api(tok), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        private: true,
        auto_init: false,
        description: 'Noto vault — notes, encrypted journal, and the review ledger.',
      }),
    });

    if (res.status === 422) {
      // Already exists: adopt it rather than failing.
      return connect(tok, `${login}/${name}`);
    }
    if (res.status === 403) {
      return { ok: false, error: 'Token lacks permission to create repos. It needs Administration: read & write.' };
    }
    if (res.status !== 201) return { ok: false, error: `Could not create the repo (${res.status}).` };

    const repo = (await res.json()) as { full_name: string; private: boolean };
    const biometricLock = await setItem(TOKEN_KEY, tok, false);
    await setItem(REPO_KEY, repo.full_name, false);

    return { ok: true, connection: { login, repo: repo.full_name, isPrivate: repo.private, biometricLock } };
  } catch {
    return { ok: false, error: 'No network. GitHub is unreachable.' };
  }
}

/** Which repo we're linked to (cheap — no biometric prompt). */
export async function savedRepo(): Promise<string | null> {
  return getItem(REPO_KEY);
}

/** The sync token — a silent Keychain read (no biometric prompt), so auto-sync can run. */
export async function token(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function disconnect(): Promise<void> {
  await delItem(TOKEN_KEY);
  await delItem(REPO_KEY);
}
