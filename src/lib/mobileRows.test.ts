import { describe, it, expect } from 'vitest'
import { fromTodoRow, fromWatchRow, toTodoRow, toWatchRow } from '../../mobile/src/listRows'

/*
 * The phone stores each list row as the JSON the wire format uses, and merges it
 * on write rather than replacing it. These translators are the seam. Two real
 * bugs lived here, and both were invisible on the phone:
 *
 *   · a toggle emitted `createdAt: 0`, which the merge wrote over the real one;
 *   · a newly-created watch item omitted `hue`/`tags`/`note`, and the desktop's
 *     card does `w.tags.map(...)` — so the phone crashed the laptop, days later.
 */

describe('todo rows', () => {
  it('round-trips the fields the phone renders', () => {
    const stored = { id: 't1', text: 'read', done: true, createdAt: 10, updatedAt: 20, tag: 'cs' }
    expect(fromTodoRow(toTodoRow(stored))).toEqual(stored)
  })

  it('writes `done` as a boolean, because that is what the desktop writes', () => {
    expect(fromTodoRow({ id: 't1', text: 'x', tag: null, done: 1, createdAt: 1, updatedAt: 2 }).done).toBe(true)
    expect(toTodoRow({ id: 't1', updatedAt: 2, done: false }).done).toBe(0)
  })

  /* A toggle knows the id and the tick. It does not know when the todo was made. */
  it('omits an unknown createdAt rather than writing zero over the real one', () => {
    const patch = fromTodoRow({ id: 't1', text: 'x', tag: null, done: 1, createdAt: 0, updatedAt: 99 })
    expect('createdAt' in patch).toBe(false)

    const merged = { ...{ id: 't1', createdAt: 1_700_000_000_000, updatedAt: 1 }, ...patch }
    expect(merged.createdAt).toBe(1_700_000_000_000)
  })

  it("carries the desktop's note reference it cannot render", () => {
    const ref = { type: 'note' as const, id: 'n9' }
    expect(fromTodoRow(toTodoRow({ id: 't1', updatedAt: 1, ref })).ref).toEqual(ref)
  })

  it('omits an absent tag instead of writing null', () => {
    expect('tag' in fromTodoRow({ id: 't1', text: 'x', tag: null, done: 0, createdAt: 1, updatedAt: 2 })).toBe(false)
  })
})

describe('watch rows', () => {
  it('round-trips every field, including the ones only the desktop renders', () => {
    const stored = {
      id: 'v1',
      kind: 'video',
      title: 'GPT',
      source: 'youtube.com',
      url: 'https://x',
      mins: 12,
      done: false,
      addedAt: 5,
      updatedAt: 9,
      hue: 358,
      tags: ['ml'],
      note: 'watch twice',
      thumb: 'https://t.png',
      added: 'just now',
    }
    expect(fromWatchRow(toWatchRow(stored))).toEqual(stored)
  })

  /*
   * A watch item created on the phone has no stored row to merge into, so
   * anything this drops never exists — and the desktop reads `tags` and `hue`
   * without a default.
   */
  it('keeps the fields a phone-created item supplies', () => {
    const created = fromWatchRow({
      id: 'v1',
      kind: 'article',
      title: 'T',
      source: 's',
      url: 'https://x',
      mins: 0,
      done: 0,
      addedAt: 1,
      updatedAt: 1,
      hue: 215,
      tags: [],
      note: '',
      added: 'just now',
    })
    expect(created.hue).toBe(215)
    expect(created.tags).toEqual([])
    expect(created.note).toBe('')
    expect(created.added).toBe('just now')
  })

  it('omits fields it genuinely has nothing for, leaving the stored value alone', () => {
    const patch = fromWatchRow({
      id: 'v1',
      kind: 'article',
      title: 'T',
      source: 's',
      url: 'https://x',
      mins: 0,
      done: 1,
      addedAt: 1,
      updatedAt: 2,
    })
    expect('thumb' in patch).toBe(false)
    expect({ ...{ id: 'v1', updatedAt: 1, thumb: 'keep.png' }, ...patch }.thumb).toBe('keep.png')
  })

  it('reads a desktop row that predates the phone entirely', () => {
    const row = toWatchRow({ id: 'v1', updatedAt: 7, title: 'T', url: 'https://x', done: false })
    expect(row.kind).toBe('article')
    expect(row.mins).toBe(0)
    expect(row.addedAt).toBe(7)
  })
})
