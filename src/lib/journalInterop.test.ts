import { describe, it, expect } from 'vitest'
import * as desktop from './crypto'
import * as phone from '../../mobile/src/journalCipher'
import { b64ToBytes, bytesToB64 } from './b64'
import { journalId, mergeVaults, emptyVault, type JournalBlob, type Vault } from './sync'

/*
 * The journal is the same journal on both devices, or it is worthless.
 *
 * The desktop encrypts with Web Crypto; Hermes has no Web Crypto, so the phone
 * encrypts with @noble. Two different implementations of the same bytes. If they
 * ever drift — a hex encoding, a different KDF hash, a payload that is a bare
 * string on one side and an object on the other — nothing throws. The entry just
 * fails its GCM tag, gets skipped, and the user sees an empty journal.
 *
 * So this test runs BOTH REAL MODULES against each other. It is the only place
 * in the suite that imports across the mobile boundary, and that is the point.
 */

const PASSPHRASE = 'correct horse battery staple'
const ITERATIONS = 1000 // the shipped 600k is the same code, 600x slower
const nonce = () => crypto.getRandomValues(new Uint8Array(12))

/** The phone's key as raw bytes; the desktop's is deliberately non-extractable. */
const keys = async (salt: string, pass = PASSPHRASE) => ({
  desk: await desktop.deriveKey(pass, salt, ITERATIONS),
  phone: await phone.deriveKey(pass, salt, ITERATIONS),
})

describe('journal crypto — desktop and phone', () => {
  it('derive the same key from the same passphrase and salt', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)

    // The Web Crypto key can't be exported, so compare by behaviour: anything one
    // encrypts, the other must open.
    const sealed = await desktop.encryptJSON(desk, { probe: 42 })
    expect(phone.decryptJSON<{ probe: number }>(mobileKey, sealed)?.probe).toBe(42)
  })

  it('the desktop reads an entry written on the phone', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)

    const entry = { text: 'Rain on the window. I finally understood B-trees.', words: 8 }
    const fromPhone = phone.encryptJSON(mobileKey, entry, nonce())

    expect(await desktop.decryptJSON<typeof entry>(desk, fromPhone)).toEqual(entry)
  })

  it('the phone reads an entry written on the desktop', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)

    const entry = { text: 'A day with two thoughts in it.', words: 7 }
    const fromDesktop = await desktop.encryptJSON(desk, entry)

    expect(phone.decryptJSON<typeof entry>(mobileKey, fromDesktop)).toEqual(entry)
  })

  it('agree on the verifier, so each can tell a wrong passphrase from a broken vault', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)

    expect(phone.VERIFIER).toBe(desktop.VERIFIER)
    expect(phone.checkVerifier(mobileKey, await desktop.makeVerifier(desk))).toBe(true)
    expect(await desktop.checkVerifier(desk, phone.makeVerifier(mobileKey, nonce()))).toBe(true)
  })

  it('both reject a wrong passphrase rather than returning garbage', async () => {
    const salt = desktop.randomSalt()
    const { desk } = await keys(salt)
    const wrong = await keys(salt, 'not the passphrase')

    const verifier = await desktop.makeVerifier(desk)
    expect(phone.checkVerifier(wrong.phone, verifier)).toBe(false)
    expect(await desktop.checkVerifier(wrong.desk, verifier)).toBe(false)
  })

  it('both detect a single flipped bit', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)

    const good = await desktop.encryptJSON(desk, { text: 'x', words: 1 })
    const bytes = b64ToBytes(good.ct)
    bytes[0] ^= 1
    const tampered = { iv: good.iv, ct: bytesToB64(bytes) }

    expect(phone.decryptJSON(mobileKey, tampered)).toBeNull()
    await expect(desktop.decryptJSON(desk, tampered)).rejects.toThrow()
  })

  it('never reuse a nonce for the same plaintext', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)
    const entry = { text: 'same words', words: 2 }

    const a = phone.encryptJSON(mobileKey, entry, nonce())
    const b = phone.encryptJSON(mobileKey, entry, nonce())
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)

    const c = await desktop.encryptJSON(desk, entry)
    const d = await desktop.encryptJSON(desk, entry)
    expect(c.iv).not.toBe(d.iv)
  })

  it('refuses a nonce that is not 96 bits', async () => {
    const { phone: mobileKey } = await keys(desktop.randomSalt())
    expect(() => phone.encryptJSON(mobileKey, {}, new Uint8Array(16))).toThrow(/12-byte/)
  })

  it('agree on the legacy-envelope test, so old entries are held back, not shipped', () => {
    const hexIv = 'a1b2c3d4e5f6a1b2c3d4e5f6' // 12 bytes, hex
    expect(phone.isLegacyEnvelope(hexIv)).toBe(true)
    expect(phone.isLegacyEnvelope(bytesToB64(new Uint8Array(12)))).toBe(false)
  })

  it('share the same iteration-count constants', () => {
    expect(phone.CURRENT_ITERATIONS).toBe(desktop.CURRENT_ITERATIONS)
    expect(phone.DEFAULT_ITERATIONS).toBe(desktop.DEFAULT_ITERATIONS)
  })
})

describe("today's entry, written on both devices", () => {
  const blob = (day: number, c: { iv: string; ct: string }, updatedAt: number): JournalBlob => ({
    id: journalId(day),
    day,
    iv: c.iv,
    ct: c.ct,
    createdAt: day * 86_400_000,
    updatedAt,
  })
  const vaultOf = (j: JournalBlob[]): Vault => ({ ...emptyVault(), journal: j })

  /*
   * The end-to-end claim: I write in the morning on the laptop, again in the
   * evening on the phone, sync, and see ONE entry — the evening one — on both.
   */
  it('converges on one entry, and the other device can read it', async () => {
    const salt = desktop.randomSalt()
    const { desk, phone: mobileKey } = await keys(salt)
    const day = 20_644

    const morning = await desktop.encryptJSON(desk, { text: 'started the proof', words: 3 })
    const evening = phone.encryptJSON(mobileKey, { text: 'finished the proof', words: 3 }, nonce())

    const merged = mergeVaults(vaultOf([blob(day, morning, 100)]), vaultOf([blob(day, evening, 900)])).vault

    expect(merged.journal).toHaveLength(1)
    const readBack = await desktop.decryptJSON<{ text: string }>(desk, merged.journal[0])
    expect(readBack.text).toBe('finished the proof')
  })

  it('two different days stay two entries', async () => {
    const salt = desktop.randomSalt()
    const { desk } = await keys(salt)
    const a = await desktop.encryptJSON(desk, { text: 'monday', words: 1 })
    const b = await desktop.encryptJSON(desk, { text: 'tuesday', words: 1 })

    const merged = mergeVaults(vaultOf([blob(1, a, 1)]), vaultOf([blob(2, b, 2)])).vault
    expect(merged.journal).toHaveLength(2)
  })
})
