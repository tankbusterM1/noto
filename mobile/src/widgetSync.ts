import { useData, dueCount } from './store';
import * as Widgets from '../modules/noto-widgets';

/*
 * Feeds the iOS widgets + the review Live Activity from the same store the app
 * renders. On any device without the native bridge (web, Expo Go, Android) every
 * call is a no-op, so this is safe to wire in unconditionally.
 */

const QUOTES: { text: string; author: string }[] = [
  { text: 'We are what we repeatedly do.', author: 'Will Durant' },
  { text: 'Memory is the treasury and guardian of all things.', author: 'Cicero' },
  { text: 'Repetition is the mother of retention.', author: 'Proverb' },
  { text: 'The palest ink outlasts the sharpest memory.', author: 'Proverb' },
  { text: 'What we learn with pleasure we never forget.', author: 'Alfred Mercier' },
  { text: 'A page unreviewed fades a little each night.', author: 'Noto' },
];

function quoteForToday(): { text: string; author: string } {
  const day = Math.floor(Date.now() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

export function buildSnapshot(): Widgets.NotoSnapshot {
  const s = useData.getState();
  const reviewsDue = dueCount(s.memory);
  const open = s.todos.filter((t) => !t.done);
  const doneToday = s.todos.filter((t) => t.done).length;
  const q = quoteForToday();
  return {
    reviewsDue,
    todosOpen: open.length,
    todos: open.slice(0, 3).map((t) => t.text),
    streak: 0, // TODO: derive a real review streak from the ledger
    nextLabel: reviewsDue > 0 ? `${reviewsDue} waiting` : 'all caught up',
    quote: q.text,
    quoteAuthor: q.author,
    doneToday,
    totalToday: Math.max(s.todos.length, 1),
  };
}

let lastSig = '';
function push(): void {
  const snap = buildSnapshot();
  // Skip redundant native calls — the store notifies on every set, most of which
  // don't change anything a widget shows.
  const sig = `${snap.reviewsDue}|${snap.todosOpen}|${snap.doneToday}|${snap.todos.join('¶')}|${snap.quote}`;
  if (sig === lastSig) return;
  lastSig = sig;
  Widgets.setSnapshot(snap);
}

/** Start mirroring store → widgets. Returns an unsubscribe. Call once at boot. */
export function initWidgetSync(): () => void {
  if (!Widgets.isSupported()) return () => {};
  lastSig = ''; // a fresh (re)init always pushes the current snapshot
  push();
  return useData.subscribe(push);
}

// ── Review Live Activity lifecycle (call from the Review screen) ──────────
export function startReviewActivity(total: number): void {
  if (!Widgets.isSupported() || total <= 0) return;
  const q = quoteForToday();
  Widgets.startReview(total, total, q.text, buildSnapshot().streak);
}

export function updateReviewActivity(remaining: number, total: number): void {
  if (!Widgets.isSupported()) return;
  const q = quoteForToday();
  Widgets.updateReview(remaining, total, q.text, buildSnapshot().streak);
}

export function endReviewActivity(): void {
  if (!Widgets.isSupported()) return;
  Widgets.endReview();
}
