import { requireOptionalNativeModule } from 'expo';

// Optional: null on web / Expo Go / Android, so every call below degrades to a
// no-op instead of throwing. Only a native iOS build has the module.
const Native = requireOptionalNativeModule<{
  setSnapshot(json: string): void;
  liveActivitiesEnabled(): boolean;
  startReview(title: string, total: number, remaining: number, quote: string, streak: number): string | null;
  updateReview(remaining: number, total: number, quote: string, streak: number): void;
  endReview(): void;
  startTodos(title: string, name: string, due: number, todos: number, streak: number, line: string, doneToday: number, totalToday: number): string | null;
  updateTodos(name: string, due: number, todos: number, streak: number, line: string, doneToday: number, totalToday: number): void;
  endTodos(): void;
}>('NotoWidgets');

/** Everything the widgets render — written to the shared App Group. */
export interface NotoSnapshot {
  reviewsDue: number;
  todosOpen: number;
  todos: string[];
  streak: number;
  nextLabel: string;
  quote: string;
  quoteAuthor: string;
  doneToday: number;
  totalToday: number;
}

/** True only on a native iOS build where the widget bridge exists. */
export function isSupported(): boolean {
  return Native != null;
}

export function setSnapshot(snapshot: NotoSnapshot): void {
  Native?.setSnapshot(JSON.stringify(snapshot));
}

export function liveActivitiesEnabled(): boolean {
  return Native?.liveActivitiesEnabled() ?? false;
}

export function startReview(
  total: number,
  remaining: number,
  quote: string,
  streak: number,
  title = 'Review',
): string | null {
  return Native?.startReview(title, total, remaining, quote, streak) ?? null;
}

export function updateReview(remaining: number, total: number, quote: string, streak: number): void {
  Native?.updateReview(remaining, total, quote, streak);
}

export function endReview(): void {
  Native?.endReview();
}

export function startTodos(
  name: string,
  due: number,
  todos: number,
  streak: number,
  line: string,
  doneToday: number,
  totalToday: number,
  title = 'Today',
): string | null {
  return Native?.startTodos(title, name, due, todos, streak, line, doneToday, totalToday) ?? null;
}

export function updateTodos(
  name: string,
  due: number,
  todos: number,
  streak: number,
  line: string,
  doneToday: number,
  totalToday: number,
): void {
  Native?.updateTodos(name, due, todos, streak, line, doneToday, totalToday);
}

export function endTodos(): void {
  Native?.endTodos();
}
