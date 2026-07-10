/*
 * Open the real vault's journal with the PHONE's crypto module.
 *
 * The desktop wrote `journal/*.json` through Web Crypto. This script derives the
 * key exactly as the iOS app does — @noble PBKDF2, base64 envelopes, the shared
 * `{text, words}` payload — and reads the entries back. If the two stacks ever
 * drift, this is where it shows, instead of on a phone with an empty journal.
 *
 *   npx tsx scripts/journal-proof.mts <token> <passphrase> [repo]
 */
import { ensureRepo, pull } from '../src/lib/gitapi.ts';
import { filesToVault } from '../src/lib/sync.ts';
import * as phone from '../mobile/src/journalCipher.ts';

const [token, passphrase, repoName = 'noto-vault'] = process.argv.slice(2);
if (!token || !passphrase) throw new Error('usage: journal-proof.mts <token> <passphrase> [repo]');

const repo = await ensureRepo(token, repoName);
const vault = filesToVault((await pull(token, repo)).files);

if (!vault.crypto) throw new Error('this vault has no journal passphrase');
console.log(`repo        : ${repo.owner}/${repo.name}`);
console.log(`iterations  : ${vault.crypto.iterations}`);
console.log(`entries     : ${vault.journal.length}`);

const t0 = Date.now();
const key = await phone.deriveKey(passphrase, vault.crypto.salt, vault.crypto.iterations);
console.log(`derive      : ${Date.now() - t0} ms (node; Hermes is slower, and it happens once)`);

if (!phone.checkVerifier(key, vault.crypto.verifier)) throw new Error('verifier rejected the passphrase');
console.log('verifier    : accepted\n');

let opened = 0;
for (const blob of vault.journal.slice().sort((a, b) => b.day - a.day)) {
  const entry = phone.decryptJSON<{ text: string; words: number }>(key, blob);
  if (!entry) {
    console.log(`  FAIL ${blob.id} — could not decrypt`);
    continue;
  }
  opened++;
  console.log(`  ${blob.id}  ${String(entry.words).padStart(3)} words  "${entry.text.slice(0, 58)}…"`);
}

const wrong = await phone.deriveKey(passphrase + 'x', vault.crypto.salt, vault.crypto.iterations);
console.log(`\nwrong passphrase rejected: ${!phone.checkVerifier(wrong, vault.crypto.verifier)}`);
console.log(`${opened}/${vault.journal.length} entries opened with the phone's crypto`);
process.exit(opened === vault.journal.length ? 0 : 1);
