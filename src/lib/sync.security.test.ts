import { describe, it, expect } from 'vitest'
import { parseNote, serializeNote } from './sync'

/*
 * A note file is fetched from a synced GitHub repo — untrusted input. The
 * front-matter parser assigns `field[key] = …` by key, so a `__proto__` /
 * `constructor` / `prototype` key must never reach the assignment (F9).
 */
describe('parseNote — prototype-key hardening', () => {
  const base = serializeNote({
    id: 'n1',
    title: 'ok',
    folderId: '',
    tags: [],
    body: 'hi',
    createdAt: 1,
    updatedAt: 2,
  })

  it('still parses a normal note (the guard does not break valid front-matter)', () => {
    const note = parseNote(base)
    expect(note).not.toBeNull()
    expect(note!.id).toBe('n1')
    expect(note!.title).toBe('ok')
  })

  it('does not let __proto__ inject a folder through the prototype chain', () => {
    // Drop the real `folder` line, then try to supply one via __proto__. Without
    // the guard, `field.folder` would resolve to "evil" off the injected proto.
    const poisoned = base
      .replace('\nfolder: ""', '')
      .replace('id: "n1"', 'id: "n1"\n__proto__: {"folder":"evil"}')
    const note = parseNote(poisoned)
    expect(note).not.toBeNull()
    expect(note!.folderId).toBe('') // NOT "evil"
  })

  it('never pollutes Object.prototype', () => {
    const poisoned = base.replace(
      'id: "n1"',
      'id: "n1"\n__proto__: {"polluted":true}\nconstructor: {"polluted":true}\nprototype: {"polluted":true}',
    )
    parseNote(poisoned)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })
})
