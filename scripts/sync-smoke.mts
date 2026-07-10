/*
 * Live end-to-end check of the sync engine against a real private GitHub repo.
 *
 * Not part of the test suite — it needs a token and touches the network. Run it
 * by hand when the transport or the wire format changes:
 *
 *   npx tsx scripts/sync-smoke.mts <token> [repo-name]
 *
 * It exercises what unit tests structurally cannot: that GitHub actually accepts
 * our blob/tree/commit calls, that a second device's push merges instead of
 * clobbering, that a stale parent is REJECTED rather than silently forced, and
 * that a journal entry written on one device — with that device's own crypto
 * stack — opens on the other.
 *
 * "Desktop" here runs src/lib/crypto.ts (Web Crypto). "Phone" runs
 * mobile/src/journalCipher.ts (@noble). Those are the real modules, not stand-ins.
 */

import { ensureRepo, pull, push, GitError } from '../src/lib/gitapi.ts';
import { emptyLists, emptyVault, filesToVault, journalId, mergeVaults, vaultToFiles } from '../src/lib/sync.ts';
import type { Vault } from '../src/lib/sync.ts';
import { syncVault } from '../src/lib/vaultSync.ts';
import * as desktopCrypto from '../src/lib/crypto.ts';
import * as phoneCrypto from '../mobile/src/journalCipher.ts';

/*
 * THIS SCRIPT ERASES THE REPO IT RUNS AGAINST.
 *
 * There is no default repo name, and there never should have been. A default is
 * a guess about which of someone's repos is safe to destroy, and the earlier
 * guard here guessed the wrong way round — it protected one specific name and
 * left every other repo, including a live vault, wide open.
 *
 * So: the name is required, it must end in `-selftest`, and `--wipe` must be
 * passed. Three separate things to get wrong before anything is deleted.
 */
const [, , token, REPO_NAME, ...flags] = process.argv;

if (!token || !REPO_NAME) {
  throw new Error('usage: sync-smoke.mts <token> <repo-ending-in--selftest> --wipe');
}
if (!/-selftest$/i.test(REPO_NAME)) {
  throw new Error(`Refusing to run: "${REPO_NAME}" is not a throwaway. This script ERASES the repo. Its name must end in "-selftest".`);
}
if (!flags.includes('--wipe')) {
  throw new Error(`Refusing to run: this ERASES ${REPO_NAME}. Pass --wipe if that is what you want.`);
}

const PASSPHRASE = 'correct horse battery staple';
const ITERATIONS = 1000; // the shipped 600k is the same code, 600x slower

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const note = (id: string, title: string, updatedAt: number, body = 'body') => ({
  id,
  title,
  folderId: 'f_cs',
  tags: ['systems'],
  body,
  createdAt: 1,
  updatedAt,
});

const row = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra });

/*
 * A ref read straight after a ref update can still return the previous commit:
 * GitHub replicates refs asynchronously. The app already tolerates this — a
 * stale parent gets rejected and syncVault re-merges — but assertions need the
 * settled state, or the test measures replication lag instead of correctness.
 */
async function settle(sha: string | null) {
  for (let i = 0; i < 25; i++) {
    const r = await pull(token, repo);
    if (!sha || r.headSha === sha) return r;
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error('the ref never caught up with the commit we just pushed');
}

// ── 0. repo ───────────────────────────────────────────────────────────
console.log('\n1. repo');
const repo = await ensureRepo(token, REPO_NAME);
console.log(`  using ${repo.owner}/${repo.name} (private)`);

// Start from a known-empty state so reruns are deterministic.
const wiped = await pull(token, repo);
// Reset to a bare README: `assertLooksLikeVault` would (correctly) refuse a repo
// whose only file is an unrecognised marker.
const RESET = new Map([['README.md', '# selftest\n']]);
if (wiped.headSha) await settle((await push(token, repo, RESET, wiped.headSha, 'reset')).commitSha);

// ── 1. keys ───────────────────────────────────────────────────────────
console.log('\n2. journal keys — two implementations, one passphrase');
const salt = desktopCrypto.randomSalt();
const deskKey = await desktopCrypto.deriveKey(PASSPHRASE, salt, ITERATIONS);
const phoneKey = await phoneCrypto.deriveKey(PASSPHRASE, salt, ITERATIONS);
const verifier = await desktopCrypto.makeVerifier(deskKey);
check('the phone validates the desktop-written verifier', phoneCrypto.checkVerifier(phoneKey, verifier));

const nonce = () => crypto.getRandomValues(new Uint8Array(12));
const DAY = 20_644;
const morning = await desktopCrypto.encryptJSON(deskKey, { text: 'started the proof', words: 3 });

// ── 2. the desktop pushes ─────────────────────────────────────────────
console.log('\n3. desktop — first push into an empty repo');
const desktop: Vault = {
  notes: [note('n_btree', 'B-Trees: "why", really', 1000, '## Why\n\n- fanout\n\n---\n\nfence in body')],
  folders: [{ id: 'f_cs', name: 'CS', parentId: null, createdAt: 500, updatedAt: 900 }],
  ledger: [{ noteId: 'n_btree', day: 20000, grade: 3, ivl: 1 }],
  srs: [{ noteId: 'n_btree', ease: 2.5, ivl: 1, dueDay: 20001 }],
  journal: [{ id: journalId(DAY), day: DAY, ...morning, createdAt: 1000, updatedAt: 100 }],
  scratchpad: { ...(await desktopCrypto.encryptJSON(deskKey, 'a scratch thought')), updatedAt: 50 },
  lists: {
    ...emptyLists(),
    todos: [row('t_read', 5, { text: 'read the paper', done: false, tag: 'cs' })],
    goals: [row('g_ship', 5, { text: 'ship sync', done: false })],
    week: [row('w_mon', 5, { day: 0, text: 'lecture', done: false })],
    rituals: [row('r_walk', 5, { text: 'walk', streak: 3, done: false })],
    ranged: [row('rg_exam', 5, { text: 'exams', from: 10, to: 14, hue: 215 })],
    watch: [row('v_gpt', 5, { kind: 'video', title: 'GPT', url: 'https://x', done: false, hue: 358, tags: ['ml'], note: '' })],
  },
  tagsPool: ['cs', 'ml'],
  tombstones: [],
  crypto: { salt, iterations: ITERATIONS, verifier },
};

const a1 = await syncVault(token, repo, desktop, 'desktop');
check('pushed a first commit', a1.pushed && !!a1.commitSha, a1.commitSha?.slice(0, 7));
check('reported every list row', a1.stats.lists === 6, `${a1.stats.lists}`);

// ── 3. round-trip ─────────────────────────────────────────────────────
console.log('\n4. round-trip through GitHub');
const back = filesToVault((await settle(a1.commitSha)).files);
check('note survived', back.notes.length === 1);
check('awkward title preserved', back.notes[0]?.title === desktop.notes[0].title);
check('markdown body byte-identical', back.notes[0]?.body === desktop.notes[0].body);
check('--- fence inside body did not split the note', back.notes[0]?.body.includes('fence in body'));
check('folder createdAt survived', back.folders[0]?.createdAt === 500);
check('ledger preserved', back.ledger.length === 1);
check('every list round-tripped', Object.values(back.lists).every((l) => l.length === 1));
check('tag vocabulary preserved', back.tagsPool.join(',') === 'cs,ml');
check('journal is ciphertext only', !JSON.stringify(back.journal).includes('started the proof'));
check('journal key params published', back.crypto?.salt === salt);
check('scratchpad is ciphertext only', !JSON.stringify(back.scratchpad).includes('scratch thought'));

// The reset commit left a README. A sync must not delete files it doesn't own.
const withReadme = await pull(token, repo);
check('a README the vault does not own survived the push', withReadme.files.has('README.md'));

// ── 4. the phone reads what the desktop wrote ─────────────────────────
console.log('\n5. the phone opens the desktop\'s journal');
const remoteEntry = back.journal.find((j) => j.id === journalId(DAY))!;
const opened = phoneCrypto.decryptJSON<{ text: string; words: number }>(phoneKey, remoteEntry);
check('same text', opened?.text === 'started the proof', opened?.text);
check('same word count', opened?.words === 3);
check('a wrong passphrase is rejected', !phoneCrypto.checkVerifier(await phoneCrypto.deriveKey('wrong', salt, ITERATIONS), verifier));

// ── 5. no-op sync makes no commit ─────────────────────────────────────
console.log('\n6. syncing unchanged data');
const a2 = await syncVault(token, repo, a1.vault, 'desktop');
check('no empty commit created', a2.pushed === false);
check('head unchanged', a2.commitSha === a1.commitSha);

// ── 6. the phone merges instead of clobbering ─────────────────────────
console.log('\n7. phone — has no goals screen, rewrites today\'s entry, ticks a todo');
const evening = phoneCrypto.encryptJSON(phoneKey, { text: 'finished the proof', words: 3 }, nonce());

const phone: Vault = {
  ...emptyVault(),
  notes: [note('n_paxos', 'Paxos', 1500)],
  folders: [{ id: 'f_cs', name: 'CS', parentId: null, createdAt: 500, updatedAt: 900 }],
  ledger: [{ noteId: 'n_paxos', day: 20001, grade: 4, ivl: 3 }],
  srs: [{ noteId: 'n_paxos', ease: 2.5, ivl: 3, dueDay: 20004 }],
  journal: [{ id: journalId(DAY), day: DAY, ...evening, createdAt: 1000, updatedAt: 900 }],
  // The phone renders todos and watch; it has never heard of goals/week/rituals/ranged.
  lists: {
    ...emptyLists(),
    todos: [row('t_read', 50, { text: 'read the paper', done: true, tag: 'cs' }), row('t_phone', 50, { text: 'from the phone', done: false })],
  },
  tagsPool: ['ios'],
  crypto: null,
};

const b1 = await syncVault(token, repo, phone, 'iphone');
await settle(b1.commitSha);
check("the desktop's note survived", b1.vault.notes.some((n) => n.id === 'n_btree'));
check("the phone's note landed", b1.vault.notes.some((n) => n.id === 'n_paxos'));
check('review history is the union', b1.vault.ledger.length === 2);
check('the phone did NOT delete the goals it cannot render', b1.vault.lists.goals.length === 1);
check('nor the week, rituals, ranged, watch', ['week', 'rituals', 'ranged', 'watch'].every((k) => b1.vault.lists[k as 'week'].length === 1));
check('the ticked todo is ticked', b1.vault.lists.todos.find((t) => t.id === 't_read')?.done === true);
check("the phone's new todo landed", b1.vault.lists.todos.some((t) => t.id === 't_phone'));
check('the watch item kept its desktop-only fields', b1.vault.lists.watch[0]?.hue === 358);
check('tag vocabulary is the union', b1.vault.tagsPool.join(',') === 'cs,ios,ml');
check('the phone adopted the vault key params', b1.vault.crypto?.salt === salt);
check('scratchpad survived a device that has none', b1.vault.scratchpad !== null);

console.log('\n8. one entry per day, not two');
check('today is a single entry', b1.vault.journal.filter((j) => j.day === DAY).length === 1);
const settled = await desktopCrypto.decryptJSON<{ text: string }>(deskKey, b1.vault.journal.find((j) => j.day === DAY)!);
check('and the desktop reads the phone\'s rewrite', settled.text === 'finished the proof', settled.text);

// ── 7. deletions propagate ────────────────────────────────────────────
console.log('\n9. deletions propagate, from either side');
const deleting: Vault = structuredClone(b1.vault);
deleting.notes = deleting.notes.filter((n) => n.id !== 'n_paxos');
deleting.lists.todos = deleting.lists.todos.filter((t) => t.id !== 't_phone');
deleting.lists.goals = [];
const at = Date.now();
deleting.tombstones = [
  { id: 'n_paxos', deletedAt: at },
  { id: 't_phone', deletedAt: at },
  { id: 'g_ship', deletedAt: at },
];

const del = await syncVault(token, repo, deleting, 'desktop');
const after = filesToVault(await settle(del.commitSha).then((r) => r.files));
check('the deleted note is gone from the repo', !after.notes.some((n) => n.id === 'n_paxos'));
check('its file was actually removed', !(await pull(token, repo)).files.has('notes/n_paxos.md'));
check('the deleted todo is gone', !after.lists.todos.some((t) => t.id === 't_phone'));
check('the deleted goal is gone', after.lists.goals.length === 0);
check('the surviving todo stayed', after.lists.todos.some((t) => t.id === 't_read'));

const zombie = await syncVault(token, repo, b1.vault, 'iphone');
check('a stale device cannot resurrect the note', !zombie.vault.notes.some((n) => n.id === 'n_paxos'));
check('nor the todo', !zombie.vault.lists.todos.some((t) => t.id === 't_phone'));

// ── 8. a stale parent is REJECTED, not forced ─────────────────────────
console.log('\n10. concurrent push is rejected, not forced');
const before = await pull(token, repo);
await settle((await syncVault(token, repo, { ...emptyVault(), notes: [note('n_race', 'race', 5000)] }, 'other')).commitSha);

let rejected = false;
try {
  const files = vaultToFiles(mergeVaults(filesToVault(before.files), emptyVault()).vault);
  files.set('notes/n_stale.md', '---\nid: "n_stale"\ntitle: "x"\nfolder: ""\ntags: []\ncreated: 1\nupdated: 1\n---\n\nx');
  await push(token, repo, files, before.headSha, 'should be rejected');
} catch (e) {
  rejected = e instanceof GitError && (e.status === 422 || e.status === 409);
}
check('GitHub refused the non-fast-forward push', rejected);

const recovered = await syncVault(token, repo, { ...emptyVault(), notes: [note('n_after', 'after', 6000)] }, 'desktop');
check("the recovered sync kept the other device's note", recovered.vault.notes.some((n) => n.id === 'n_race'));
check('and landed its own', recovered.vault.notes.some((n) => n.id === 'n_after'));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
console.log(`repo: https://github.com/${repo.owner}/${repo.name}`);
process.exit(failures === 0 ? 0 : 1);
