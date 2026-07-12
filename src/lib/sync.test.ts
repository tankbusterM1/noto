import { describe, it, expect } from 'vitest'
import {
  emptyLists,
  emptyVault,
  filesToVault,
  isVaultPath,
  journalId,
  ledgerKey,
  mergeVaults,
  parseLedger,
  parseNote,
  readSchema,
  SCHEMA,
  serializeLedger,
  serializeNote,
  vaultToFiles,
  type JournalBlob,
  type Lists,
  type SyncNote,
  type Vault,
} from './sync'

const note = (id: string, updatedAt: number, over: Partial<SyncNote> = {}): SyncNote => ({
  id,
  title: `note ${id}`,
  folderId: 'f1',
  tags: ['a'],
  body: 'hello',
  createdAt: 1,
  updatedAt,
  ...over,
})

const crypt = (salt: string) => ({ salt, iterations: 600_000, verifier: { iv: 'aa', ct: 'bb' } })
const row = (id: string, updatedAt: number, over: Record<string, unknown> = {}) => ({ id, updatedAt, ...over })
const lists = (over: Partial<Lists> = {}): Lists => ({ ...emptyLists(), ...over })

describe('note front matter', () => {
  it('round-trips', () => {
    const n = note('n1', 42)
    expect(parseNote(serializeNote(n))).toEqual(n)
  })

  it('survives a title that would break naive YAML', () => {
    const n = note('n2', 7, { title: 'B-Trees: "why" — a: b, #tag' })
    expect(parseNote(serializeNote(n))?.title).toBe(n.title)
  })

  it('keeps a body that itself contains a --- fence', () => {
    const body = 'intro\n\n---\n\nafter the rule\n'
    const n = note('n3', 9, { body })
    expect(parseNote(serializeNote(n))?.body).toBe(body)
  })

  it('preserves markdown exactly, so the file stays diffable', () => {
    const body = '## Why\n\n- one\n- two\n\n```py\nx = 1\n```'
    expect(parseNote(serializeNote(note('n4', 1, { body })))?.body).toBe(body)
  })

  it('returns null on junk instead of throwing', () => {
    expect(parseNote('not a note')).toBeNull()
    expect(parseNote('---\nid: [broken\n---\n')).toBeNull()
    expect(parseNote('---\nid: "x"\n---\n')).toBeNull() // missing timestamps
  })
})

describe('ledger', () => {
  const l = (noteId: string, day: number, grade = 3, ivl = 1) => ({ noteId, day, grade, ivl })

  it('round-trips as JSON Lines', () => {
    const rows = [l('n1', 5), l('n2', 3)]
    expect(parseLedger(serializeLedger(rows))).toHaveLength(2)
  })

  it('serialises in a stable order, so an unchanged ledger produces no diff', () => {
    const a = serializeLedger([l('n1', 5), l('n2', 3)])
    const b = serializeLedger([l('n2', 3), l('n1', 5)])
    expect(a).toBe(b)
  })

  it('drops a corrupt line without losing the rest of the history', () => {
    const text = `${JSON.stringify(l('n1', 1))}\n{oops\n${JSON.stringify(l('n2', 2))}\n`
    expect(parseLedger(text)).toHaveLength(2)
  })

  it('identifies the same review event on both devices', () => {
    expect(ledgerKey(l('n1', 5, 3, 2))).toBe(ledgerKey({ noteId: 'n1', day: 5, grade: 3, ivl: 2 }))
  })
})

describe('mergeVaults', () => {
  const v = (over: Partial<Vault> = {}): Vault => ({ ...emptyVault(), ...over })

  it('last writer wins on the same note', () => {
    const older = note('n1', 100, { title: 'old' })
    const newer = note('n1', 200, { title: 'new' })
    expect(mergeVaults(v({ notes: [older] }), v({ notes: [newer] })).vault.notes[0].title).toBe('new')
  })

  it('unions the append-only ledger and dedupes identical events', () => {
    const shared = { noteId: 'n1', day: 5, grade: 3, ivl: 1 }
    const merged = mergeVaults(
      v({ ledger: [shared, { noteId: 'n1', day: 6, grade: 4, ivl: 2 }] }),
      v({ ledger: [shared, { noteId: 'n2', day: 5, grade: 2, ivl: 1 }] }),
    ).vault.ledger
    expect(merged).toHaveLength(3)
  })

  it('a tombstone deletes a note it outlives', () => {
    const merged = mergeVaults(
      v({ notes: [note('n1', 100)] }),
      v({ tombstones: [{ id: 'n1', deletedAt: 150 }] }),
    ).vault
    expect(merged.notes).toHaveLength(0)
    expect(merged.tombstones).toHaveLength(1) // and it persists, so it can't resurrect
  })

  it('an edit made after the delete resurrects the note on purpose', () => {
    const merged = mergeVaults(
      v({ notes: [note('n1', 200, { title: 'changed my mind' })] }),
      v({ tombstones: [{ id: 'n1', deletedAt: 150 }] }),
    ).vault
    expect(merged.notes).toHaveLength(1)
  })

  it('keeps the latest deletedAt when both sides deleted', () => {
    const merged = mergeVaults(
      v({ tombstones: [{ id: 'n1', deletedAt: 10 }] }),
      v({ tombstones: [{ id: 'n1', deletedAt: 99 }] }),
    ).vault
    expect(merged.tombstones).toEqual([{ id: 'n1', deletedAt: 99 }])
  })

  it('unions journal entries from different days', () => {
    const j = (id: string): JournalBlob => ({ id, day: 1, iv: 'aa', ct: 'bb', createdAt: 1, updatedAt: 1 })
    expect(mergeVaults(v({ journal: [j('j1')] }), v({ journal: [j('j1'), j('j2')] })).vault.journal).toHaveLength(2)
  })

  /*
   * The journal is one entry per day and it is *edited*. Both devices derive the
   * same id from the day, so an evening rewrite must beat a morning draft rather
   * than being unioned into a second copy of the same day.
   */
  it('gives the same day the same id on every device', () => {
    expect(journalId(20644)).toBe(journalId(20644))
    expect(journalId(20644)).not.toBe(journalId(20645))
  })

  it("the later rewrite of today's entry wins", () => {
    const morning: JournalBlob = { id: 'j5', day: 5, iv: 'a', ct: 'MORNING', createdAt: 1, updatedAt: 100 }
    const evening: JournalBlob = { id: 'j5', day: 5, iv: 'b', ct: 'EVENING', createdAt: 1, updatedAt: 900 }
    expect(mergeVaults(v({ journal: [morning] }), v({ journal: [evening] })).vault.journal[0].ct).toBe('EVENING')
    expect(mergeVaults(v({ journal: [evening] }), v({ journal: [morning] })).vault.journal[0].ct).toBe('EVENING')
  })

  it('the same day written on two devices is one entry, not two', () => {
    const a: JournalBlob = { id: journalId(7), day: 7, iv: 'a', ct: 'a', createdAt: 1, updatedAt: 1 }
    const b: JournalBlob = { id: journalId(7), day: 7, iv: 'b', ct: 'b', createdAt: 2, updatedAt: 2 }
    expect(mergeVaults(v({ journal: [a] }), v({ journal: [b] })).vault.journal).toHaveLength(1)
  })

  /*
   * Regression: `srs` was deleted on any tombstone, unconditionally. A note that
   * came back via edit-after-delete kept its text and lost its schedule — it
   * quietly stopped appearing in review, with nothing to show the user why.
   */
  it('a resurrected note keeps its review schedule', () => {
    const merged = mergeVaults(
      v({ notes: [note('n1', 200)], srs: [{ noteId: 'n1', ease: 2.5, ivl: 4, dueDay: 9 }] }),
      v({ tombstones: [{ id: 'n1', deletedAt: 150 }] }),
    ).vault
    expect(merged.notes).toHaveLength(1)
    expect(merged.srs).toHaveLength(1)
  })

  it('a folder renamed after its delete comes back with the note it holds', () => {
    const merged = mergeVaults(
      v({ folders: [{ id: 'f1', name: 'renamed', parentId: null, createdAt: 1, updatedAt: 300 }] }),
      v({ tombstones: [{ id: 'f1', deletedAt: 150 }] }),
    ).vault
    expect(merged.folders).toHaveLength(1)
  })

  /*
   * The mobile "delete folder" flow: it rehomes the folder's notes into another
   * folder (bumping their updatedAt) BEFORE tombstoning the folder. After sync,
   * the other device — which still had the note in the old folder — must end up
   * with the folder gone and the note safely in its new home, never orphaned.
   */
  it('deleting a folder rehomes its notes on the other device, losing nothing', () => {
    const deleter = v({
      folders: [{ id: 'f_keep', name: 'Keep', parentId: null, createdAt: 1, updatedAt: 1 }],
      notes: [note('n1', 500, { folderId: 'f_keep' })], // rehomed + bumped
      tombstones: [{ id: 'f_old', deletedAt: 400 }],
    })
    const other = v({
      folders: [
        { id: 'f_keep', name: 'Keep', parentId: null, createdAt: 1, updatedAt: 1 },
        { id: 'f_old', name: 'Old', parentId: null, createdAt: 2, updatedAt: 2 },
      ],
      notes: [note('n1', 100, { folderId: 'f_old' })], // still in the doomed folder
    })
    const merged = mergeVaults(deleter, other).vault
    expect(merged.folders.map((f) => f.id)).toEqual(['f_keep']) // the folder is gone
    expect(merged.notes).toHaveLength(1) // the note is NOT lost
    expect(merged.notes[0].folderId).toBe('f_keep') // and it followed to its new home
  })

  /*
   * The orphan the merge must heal: a note the deleting device never saw — created
   * in the doomed folder on the OTHER device — has no rehome record, so only the
   * merge can save it. It must land in a surviving folder, never point at a ghost.
   */
  it('rehomes a note that was orphaned by a folder deleted on another device', () => {
    const deleter = v({
      folders: [{ id: 'f_keep', name: 'Keep', parentId: null, createdAt: 1, updatedAt: 1 }],
      tombstones: [{ id: 'f_old', deletedAt: 400 }],
    })
    const other = v({
      folders: [
        { id: 'f_keep', name: 'Keep', parentId: null, createdAt: 1, updatedAt: 1 },
        { id: 'f_old', name: 'Old', parentId: null, createdAt: 2, updatedAt: 2 },
      ],
      notes: [note('n_new', 300, { folderId: 'f_old' })], // deleter never saw this one
    })
    const a = mergeVaults(deleter, other).vault
    const b = mergeVaults(other, deleter).vault
    expect(a.notes[0].folderId).toBe('f_keep')
    expect(a.folders.some((f) => f.id === 'f_old')).toBe(false)
    expect(a).toEqual(b) // still commutative after the repair
  })

  it('synthesises a home when every folder was deleted at once, keeping the invariant', () => {
    const merged = mergeVaults(
      v({ notes: [note('n1', 300, { folderId: 'fA' })], tombstones: [{ id: 'fA', deletedAt: 400 }] }),
      v({ notes: [note('n1', 300, { folderId: 'fA' })], tombstones: [{ id: 'fB', deletedAt: 400 }] }),
    ).vault
    expect(merged.folders).toHaveLength(1) // never zero folders while notes exist
    expect(merged.notes[0].folderId).toBe(merged.folders[0].id)
  })

  it('keeps a note in review even when it has no review history yet', () => {
    const merged = mergeVaults(v({ notes: [note('n1', 1)] }), v({ srs: [{ noteId: 'n1', ease: 2.5, ivl: 0, dueDay: 20 }] }))
    expect(merged.vault.srs).toHaveLength(1)
  })

  it('the sooner due date wins, so a note never hides from review', () => {
    const merged = mergeVaults(
      v({ srs: [{ noteId: 'n1', ease: 2.5, ivl: 10, dueDay: 500 }] }),
      v({ srs: [{ noteId: 'n1', ease: 2.3, ivl: 2, dueDay: 100 }] }),
    ).vault
    expect(merged.srs[0].dueDay).toBe(100)
  })

  it('a tombstone clears the scheduling state too', () => {
    const merged = mergeVaults(
      v({ srs: [{ noteId: 'n1', ease: 2.5, ivl: 1, dueDay: 5 }] }),
      v({ tombstones: [{ id: 'n1', deletedAt: 1 }] }),
    ).vault
    expect(merged.srs).toHaveLength(0)
  })

  it('adopts the journal key parameters from whichever side has them', () => {
    const c = crypt('AAA')
    expect(mergeVaults(v(), v({ crypto: c })).stats.cryptoConflict).toBe(false)
    expect(mergeVaults(v(), v({ crypto: c })).vault.crypto).toEqual(c)
  })

  it('flags two different journal passphrases instead of silently picking one', () => {
    const merged = mergeVaults(v({ crypto: crypt('AAA') }), v({ crypto: crypt('BBB') }))
    expect(merged.stats.cryptoConflict).toBe(true)
    expect(merged.vault.crypto).toEqual(mergeVaults(v({ crypto: crypt('BBB') }), v({ crypto: crypt('AAA') })).vault.crypto)
  })

  /*
   * The property that makes sync safe. If merge weren't commutative, two devices
   * could converge on different states and each would keep "fixing" the other.
   */
  it('is COMMUTATIVE — merge(a,b) equals merge(b,a)', () => {
    const a = v({
      notes: [note('n1', 100, { title: 'a' }), note('n2', 300)],
      ledger: [{ noteId: 'n1', day: 1, grade: 3, ivl: 1 }],
      srs: [{ noteId: 'n1', ease: 2.5, ivl: 1, dueDay: 9 }],
      tombstones: [{ id: 'n9', deletedAt: 5 }],
      folders: [{ id: 'f1', name: 'A', parentId: null, createdAt: 1, updatedAt: 10 }],
      crypto: crypt('AAA'),
      scratchpad: { iv: 'a', ct: 'a', updatedAt: 10 },
      tagsPool: ['ml', 'systems'],
      lists: lists({ todos: [row('t1', 5, { text: 'a' }), row('t2', 9)], watch: [row('v1', 1)] }),
    })
    const b = v({
      notes: [note('n1', 200, { title: 'b' }), note('n3', 50)],
      ledger: [{ noteId: 'n2', day: 2, grade: 4, ivl: 3 }],
      srs: [{ noteId: 'n1', ease: 2.3, ivl: 4, dueDay: 3 }],
      tombstones: [{ id: 'n9', deletedAt: 7 }],
      folders: [{ id: 'f1', name: 'B', parentId: null, createdAt: 1, updatedAt: 20 }],
      crypto: crypt('BBB'),
      scratchpad: { iv: 'b', ct: 'b', updatedAt: 20 },
      tagsPool: ['systems', 'os'],
      lists: lists({ todos: [row('t1', 7, { text: 'b' })], goals: [row('g1', 3)] }),
    })
    expect(mergeVaults(a, b).vault).toEqual(mergeVaults(b, a).vault)
  })

  it('is commutative even when updatedAt ties exactly', () => {
    const a = v({ notes: [note('n1', 100, { title: 'aaa' })] })
    const b = v({ notes: [note('n1', 100, { title: 'zzz' })] })
    expect(mergeVaults(a, b).vault).toEqual(mergeVaults(b, a).vault)
  })

  it('is IDEMPOTENT — merging a vault with itself changes nothing', () => {
    const a = v({ notes: [note('n1', 1), note('n2', 2)], ledger: [{ noteId: 'n1', day: 1, grade: 3, ivl: 1 }] })
    expect(mergeVaults(a, a).vault).toEqual(mergeVaults(a, emptyVault()).vault)
  })
})

describe('the small collections', () => {
  const v = (over: Partial<Vault> = {}): Vault => ({ ...emptyVault(), ...over })

  it('merges a todo edited on both devices by last write', () => {
    const merged = mergeVaults(
      v({ lists: lists({ todos: [row('t1', 100, { text: 'old', done: false })] }) }),
      v({ lists: lists({ todos: [row('t1', 200, { text: 'new', done: true })] }) }),
    ).vault
    expect(merged.lists.todos[0]).toMatchObject({ text: 'new', done: true })
  })

  it('unions todos created independently on each device', () => {
    const merged = mergeVaults(
      v({ lists: lists({ todos: [row('t1', 1)] }) }),
      v({ lists: lists({ todos: [row('t2', 1)] }) }),
    ).vault
    expect(merged.lists.todos.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('a tombstone deletes a todo across devices', () => {
    const merged = mergeVaults(
      v({ lists: lists({ todos: [row('t1', 100)] }) }),
      v({ tombstones: [{ id: 't1', deletedAt: 150 }] }),
    ).vault
    expect(merged.lists.todos).toHaveLength(0)
  })

  it('a todo ticked after the delete comes back, like a note would', () => {
    const merged = mergeVaults(
      v({ lists: lists({ todos: [row('t1', 200, { done: true })] }) }),
      v({ tombstones: [{ id: 't1', deletedAt: 150 }] }),
    ).vault
    expect(merged.lists.todos).toHaveLength(1)
  })

  /*
   * The reason list rows are untyped pass-through. The phone has no Goals
   * screen, so its vault has `goals: []`. If absence read as deletion, opening
   * the phone once would wipe every goal off the desktop.
   */
  it("a device that doesn't know a collection cannot delete it", () => {
    const desktop = v({ lists: lists({ goals: [row('g1', 5, { text: 'ship it' })], ranged: [row('rg1', 5)] }) })
    const phone = v({ lists: lists({ todos: [row('t1', 9)] }) })
    const merged = mergeVaults(phone, desktop).vault
    expect(merged.lists.goals).toHaveLength(1)
    expect(merged.lists.ranged).toHaveLength(1)
    expect(merged.lists.todos).toHaveLength(1)
  })

  it('carries fields it has never heard of, untouched', () => {
    const merged = mergeVaults(
      v({ lists: lists({ watch: [row('v1', 9, { thumb: 'x.png', futureField: { deep: [1, 2] } })] }) }),
      v(),
    ).vault
    expect(merged.lists.watch[0].futureField).toEqual({ deep: [1, 2] })
  })

  it('unions the tag vocabulary and never shrinks it', () => {
    const merged = mergeVaults(v({ tagsPool: ['b', 'a'] }), v({ tagsPool: ['c'] })).vault
    expect(merged.tagsPool).toEqual(['a', 'b', 'c'])
  })

  it('keeps the most recent scratchpad ciphertext', () => {
    const merged = mergeVaults(
      v({ scratchpad: { iv: 'i1', ct: 'old', updatedAt: 1 } }),
      v({ scratchpad: { iv: 'i2', ct: 'new', updatedAt: 2 } }),
    ).vault
    expect(merged.scratchpad?.ct).toBe('new')
  })

  it('drops a row that has no id or no stamp instead of merging blind', () => {
    const files = new Map([['lists/todos.json', JSON.stringify([{ id: 't1', updatedAt: 1 }, { id: 't2' }, { updatedAt: 3 }])]])
    expect(filesToVault(files).lists.todos.map((r) => r.id)).toEqual(['t1'])
  })

  /*
   * The repo is a real repo. If the vault claimed every path, the next sync would
   * delete the README, the LICENSE and any CI workflow — silently, from a device
   * that never knew they existed.
   */
  it('claims only the paths it writes', () => {
    for (const p of [...vaultToFiles({ ...emptyVault(), notes: [note('n1', 1)] }).keys()]) {
      expect(isVaultPath(p)).toBe(true)
    }
    expect(isVaultPath('journal/j5.json')).toBe(true)
    expect(isVaultPath('README.md')).toBe(false)
    expect(isVaultPath('LICENSE')).toBe(false)
    expect(isVaultPath('.github/workflows/ci.yml')).toBe(false)
    expect(isVaultPath('notes/deep/nested.txt')).toBe(false)
  })

  it('survives JSON that parses but is the wrong shape', () => {
    const junk = new Map([
      ['folders.json', '{"not":"an array"}'],
      ['tombstones.json', '42'],
      ['state/srs.json', '"a string"'],
      ['lists/todos.json', 'null'],
      ['prefs.json', '{"tagsPool": 7}'],
    ])
    const v = filesToVault(junk)
    expect(v.folders).toEqual([])
    expect(v.tombstones).toEqual([])
    expect(v.srs).toEqual([])
    expect(v.lists.todos).toEqual([])
    expect(v.tagsPool).toEqual([])
  })

  /* A `0 > SCHEMA` comparison fails open, letting an old build overwrite a new vault. */
  it('reads a corrupt manifest as our own schema, never as zero', () => {
    expect(readSchema(new Map([['manifest.json', '{"schema":"two"}']]))).toBe(SCHEMA)
    expect(readSchema(new Map([['manifest.json', '{}']]))).toBe(SCHEMA)
    expect(readSchema(new Map([['manifest.json', '[]']]))).toBe(SCHEMA)
    expect(readSchema(new Map([['manifest.json', '{"schema":null}']]))).toBe(SCHEMA)
  })

  it('reads a schema-1 vault, which had no lists at all', () => {
    const old = new Map([
      ['manifest.json', '{"schema":1}'],
      ['notes/n1.md', serializeNote(note('n1', 1))],
    ])
    const vault = filesToVault(old)
    expect(vault.lists.todos).toEqual([])
    expect(vault.tagsPool).toEqual([])
    expect(readSchema(old)).toBe(1)
    // …and merging one in must not throw or lose the note.
    expect(mergeVaults(emptyVault(), vault).vault.notes).toHaveLength(1)
  })
})

describe('repo files', () => {
  it('round-trips a whole vault through the file layout', () => {
    const vault: Vault = {
      notes: [note('n1', 10), note('n2', 20, { body: '## h\n\ntext' })],
      folders: [{ id: 'f1', name: 'CS', parentId: null, createdAt: 1, updatedAt: 5 }],
      ledger: [{ noteId: 'n1', day: 3, grade: 3, ivl: 1 }],
      journal: [{ id: 'j1', day: 2, iv: 'ab', ct: 'cd', createdAt: 9, updatedAt: 9 }],
      tombstones: [{ id: 'nX', deletedAt: 4 }],
      srs: [{ noteId: 'n1', ease: 2.5, ivl: 3, dueDay: 40 }],
      crypto: crypt('AAA'),
      scratchpad: { iv: 'sp', ct: 'zz', updatedAt: 3 },
      tagsPool: ['ml', 'systems'],
      lists: lists({
        todos: [row('t1', 8, { text: 'a', done: false })],
        goals: [row('g1', 2, { text: 'g', done: true })],
        week: [row('w1', 2, { day: 3 })],
        rituals: [row('r1', 2, { streak: 4 })],
        ranged: [row('rg1', 2, { from: 1, to: 5 })],
        watch: [row('v1', 2, { url: 'https://x', tags: ['ml'] })],
      }),
      bytes: [row('b1', 3, { pack: 'foundations', topic: 'sql', level: 1, title: 'X', blurb: 'Y' })],
    }
    expect(filesToVault(vaultToFiles(vault))).toEqual(vault)
  })

  it('writes the paths sync expects', () => {
    const files = vaultToFiles({ ...emptyVault(), notes: [note('n1', 1)] })
    expect([...files.keys()].sort()).toEqual([
      'folders.json',
      'lists/goals.json',
      'lists/ranged.json',
      'lists/rituals.json',
      'lists/todos.json',
      'lists/watch.json',
      'lists/week.json',
      'manifest.json',
      'notes/n1.md',
      'prefs.json',
      'state/ledger.jsonl',
      'state/srs.json',
      'tombstones.json',
    ])
  })

  it('never mistakes the journal key file for an entry', () => {
    const files = vaultToFiles({
      ...emptyVault(),
      crypto: crypt('AAA'),
      scratchpad: { iv: 'i', ct: 'c', updatedAt: 1 },
      journal: [{ id: 'j1', day: 1, iv: 'a', ct: 'b', createdAt: 1, updatedAt: 1 }],
    })
    expect(filesToVault(files).journal.map((j) => j.id)).toEqual(['j1'])
  })

  it('the journal file carries ciphertext only — never plaintext', () => {
    const files = vaultToFiles({ ...emptyVault(), journal: [{ id: 'j1', day: 1, iv: 'iv', ct: 'CIPHER', createdAt: 1, updatedAt: 1 }] })
    const blob = files.get('journal/j1.json')!
    expect(blob).toContain('CIPHER')
    expect(blob).not.toContain('text')
  })

  it('reports the schema a vault was written with', () => {
    expect(readSchema(vaultToFiles(emptyVault()))).toBe(SCHEMA)
    expect(readSchema(new Map([['manifest.json', '{"schema":99}']]))).toBe(99)
  })

  it('assumes our own schema when the manifest is missing or corrupt', () => {
    expect(readSchema(new Map())).toBe(SCHEMA)
    expect(readSchema(new Map([['manifest.json', 'not json']]))).toBe(SCHEMA)
  })

  /* If the manifest held a timestamp, two idle devices would trade empty commits. */
  it('an unchanged vault serialises to a byte-identical tree', () => {
    const vault: Vault = { ...emptyVault(), notes: [note('n1', 1)] }
    expect([...vaultToFiles(vault)]).toEqual([...vaultToFiles(vault)])
  })

  it('ignores junk files in the repo instead of failing the pull', () => {
    const files = new Map([
      ['README.md', 'hand-written'],
      ['notes/broken.md', 'not front matter'],
      ['notes/n1.md', serializeNote(note('n1', 1))],
    ])
    expect(filesToVault(files).notes.map((n) => n.id)).toEqual(['n1'])
  })
})
