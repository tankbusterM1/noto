import type { ListRow, TodoRow, WatchKind, WatchRow } from './db';

/*
 * The seam between the wire format and the shapes the phone's screens want.
 *
 * Nothing platform-specific lives here, so these can be run in Node against the
 * desktop's expectations. That matters: both bugs this file has carried were
 * invisible on the phone and only surfaced on the laptop, days later.
 *
 * Two rules, and they are the whole point:
 *
 *   1. Write the DESKTOP's shape. `done` is a boolean on the wire; SQLite has no
 *      boolean, so the UI model uses 0/1. If the stored JSON used 0/1 the two
 *      devices would flip the type back and forth on every sync.
 *
 *   2. Omit what you don't know; never write a placeholder. Stored rows are
 *      merged, not replaced, so a `createdAt: 0` from a toggle would overwrite
 *      the real timestamp. But a row CREATED here has nothing to merge into —
 *      so anything omitted at creation never exists at all.
 */

export const toTodoRow = (r: ListRow): TodoRow => ({
  id: r.id,
  text: String(r.text ?? ''),
  tag: (r.tag as string | undefined) ?? null,
  done: r.done ? 1 : 0,
  createdAt: (r.createdAt as number | undefined) ?? r.updatedAt,
  updatedAt: r.updatedAt,
  ...(r.ref ? { ref: r.ref as TodoRow['ref'] } : {}),
});

/**
 * `createdAt` is omitted when falsy, not written as 0. `toggleTodo` doesn't know
 * a todo's creation time — the UI model never carried it — so it passes 0.
 */
export const fromTodoRow = (t: TodoRow): ListRow => ({
  id: t.id,
  text: t.text,
  done: !!t.done,
  updatedAt: t.updatedAt,
  ...(t.createdAt ? { createdAt: t.createdAt } : {}),
  ...(t.tag ? { tag: t.tag } : {}),
  ...(t.ref ? { ref: t.ref } : {}),
});

export const toWatchRow = (r: ListRow): WatchRow => ({
  id: r.id,
  kind: (r.kind as WatchKind) ?? 'article',
  title: String(r.title ?? ''),
  source: String(r.source ?? ''),
  url: String(r.url ?? ''),
  mins: (r.mins as number | undefined) ?? 0,
  done: r.done ? 1 : 0,
  addedAt: (r.addedAt as number | undefined) ?? r.updatedAt,
  updatedAt: r.updatedAt,
  hue: r.hue as number | undefined,
  tags: r.tags as string[] | undefined,
  note: r.note as string | undefined,
  thumb: r.thumb as string | undefined,
  added: r.added as string | undefined,
});

/**
 * The fields this platform owns, plus any desktop-only ones the caller supplied.
 *
 * A watch item created on the phone has no stored row to merge into, so whatever
 * this omits never exists. The desktop's cards read `hue`, `tags` and `note`
 * without a default — omitting them doesn't degrade, it throws, on the other device.
 */
export const fromWatchRow = (w: WatchRow): ListRow => ({
  id: w.id,
  kind: w.kind,
  title: w.title,
  source: w.source,
  url: w.url,
  mins: w.mins,
  done: !!w.done,
  addedAt: w.addedAt,
  updatedAt: w.updatedAt,
  ...(w.hue !== undefined ? { hue: w.hue } : {}),
  ...(w.tags !== undefined ? { tags: w.tags } : {}),
  ...(w.note !== undefined ? { note: w.note } : {}),
  ...(w.thumb !== undefined ? { thumb: w.thumb } : {}),
  ...(w.added !== undefined ? { added: w.added } : {}),
});
