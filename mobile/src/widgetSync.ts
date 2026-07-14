import { useData, dueCount } from './store';
import * as Widgets from '../modules/noto-widgets';
import { notify, dates } from '../core';

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
    streak: s.byteStreak.count,
    nextLabel: reviewsDue > 0 ? `${reviewsDue} waiting` : 'all caught up',
    quote: q.text,
    quoteAuthor: q.author,
    doneToday,
    totalToday: Math.max(s.todos.length, 1),
  };
}

// ── The daily-nudge Live Activity (pin it to keep your streak) ─────────────
interface NudgeState {
  name: string;
  due: number;
  todos: number;
  streak: number;
  line: string;
  doneToday: number;
  totalToday: number;
}

// Celebration lines for when the day is clear — the notify engine only writes
// "get to work" copy, so the all-done voice lives here.
const DONE_LINES = [
  'Clear, {name}. Your {streak}-day streak is safe.',
  'Nothing left, {name}. {streak} days strong.',
  'Done for today, {name}. Rest easy — the chain holds.',
  'Inbox zero for the mind, {name}. See you tomorrow.',
];

function buildNudge(): NudgeState {
  const s = useData.getState();
  const due = dueCount(s.memory);
  const todos = s.todos.filter((t) => !t.done).length;
  const doneToday = s.todos.filter((t) => t.done).length;
  const streak = s.byteStreak.count;
  const name = s.userName.trim() || 'you';
  // Stable per day so the sentence doesn't flicker as counts tick; the counts
  // themselves update live.
  const seed = dates.todayEpochDay();
  let line: string;
  if (due + todos === 0) {
    line = DONE_LINES[Math.abs(seed) % DONE_LINES.length]
      .replace(/\{name\}/g, name)
      .replace(/\{streak\}/g, String(streak));
  } else {
    // Same engine, same three personalities as the push notifications.
    const mode = s.notifyMode === 'off' ? 'normal' : s.notifyMode;
    line = notify.composeNotify(mode, { name: s.userName, due, todos, streak }, seed).body;
  }
  return { name, due, todos, streak, line, doneToday, totalToday: Math.max(s.todos.length, 1) };
}

let nudgeRunning = false;
let lastNudgeSig = '';
/**
 * Start / update / end the daily-nudge Live Activity to mirror the store: it runs
 * whenever the user has PINNED it, updating live as reviews and todos clear (and
 * flipping to a "streak safe" celebration at zero). Unpinning retires it.
 */
function syncNudgeActivity(): void {
  if (!Widgets.isSupported()) return;
  const pinned = useData.getState().todosPinned;
  const st = buildNudge();
  const sig = `${st.due}|${st.todos}|${st.streak}|${st.line}`;
  if (pinned && !nudgeRunning) {
    nudgeRunning = true;
    lastNudgeSig = sig;
    Widgets.startTodos(st.name, st.due, st.todos, st.streak, st.line, st.doneToday, st.totalToday);
  } else if (pinned && nudgeRunning) {
    if (sig !== lastNudgeSig) {
      lastNudgeSig = sig;
      Widgets.updateTodos(st.name, st.due, st.todos, st.streak, st.line, st.doneToday, st.totalToday);
    }
  } else if (!pinned && nudgeRunning) {
    nudgeRunning = false;
    Widgets.endTodos();
  }
}

let lastSig = '';
function push(): void {
  const snap = buildSnapshot();
  // Skip redundant native calls — the store notifies on every set, most of which
  // don't change anything a widget shows.
  const sig = `${snap.reviewsDue}|${snap.todosOpen}|${snap.doneToday}|${snap.todos.join('¶')}|${snap.quote}`;
  if (sig !== lastSig) {
    lastSig = sig;
    Widgets.setSnapshot(snap);
  }
  // Runs every time: the pin toggle changes no snapshot field, so it must not be
  // gated by the dedup above.
  syncNudgeActivity();
}

/** Start mirroring store → widgets. Returns an unsubscribe. Call once at boot. */
export function initWidgetSync(): () => void {
  if (!Widgets.isSupported()) return () => {};
  lastSig = ''; // a fresh (re)init always pushes the current snapshot
  nudgeRunning = false;
  // Pinning is per-session, so a fresh launch clears any Live Activity left
  // running by a previous run before we take over.
  if (!useData.getState().todosPinned) Widgets.endTodos();
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

// ── Test fires (Settings) — start a sample activity on demand ──────────────
// Seeded with sample counts so it looks alive even on a fresh account. Lock the
// phone (or, on iPhone 14 Pro+, glance at the Dynamic Island) to see it. Returns
// false when Live Activities are off or unavailable (web / Expo Go).
export function testNudgeActivity(): boolean {
  if (!Widgets.isSupported()) return false;
  const s = useData.getState();
  const streak = s.byteStreak.count || 12;
  const mode = s.notifyMode === 'off' ? 'high' : s.notifyMode;
  const line = notify.composeNotify(mode, { name: s.userName, due: 3, todos: 2, streak }, dates.todayEpochDay()).body;
  return Widgets.startTodos(s.userName.trim() || 'you', 3, 2, streak, line, 2, 7) != null;
}

export function testReviewActivity(): boolean {
  if (!Widgets.isSupported()) return false;
  const streak = useData.getState().byteStreak.count || 12;
  return Widgets.startReview(12, 8, quoteForToday().text, streak) != null;
}

/** End any running Live Activity of either kind — the "stop the test" button. */
export function endTestActivities(): void {
  Widgets.endReview();
  Widgets.endTodos();
}

/**
 * Root-cause readout for the Settings test panel. `supported` is false when the
 * native widget bridge isn't in this build (Expo Go, or the module didn't link);
 * `enabled` is false when Live Activities are switched off for Noto in iOS
 * Settings. A test fire that does nothing is always one of these two.
 */
export function liveActivityDiag(): { supported: boolean; enabled: boolean } {
  const supported = Widgets.isSupported();
  return { supported, enabled: supported ? Widgets.liveActivitiesEnabled() : false };
}
