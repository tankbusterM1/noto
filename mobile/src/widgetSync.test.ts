import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A small end-to-end test of the widget/Live-Activity workflow WITHOUT a device:
 * mock the two seams (the Noto store and the native bridge) and assert that
 *   store data  →  widget snapshot  →  the bridge
 * flows correctly, that redundant updates are deduped, that the review activity
 * lifecycle forwards the right counts, and that everything no-ops off native iOS.
 */

// Mutable fake store, hoisted so the vi.mock factory below can read it.
const h = vi.hoisted(() => ({
  state: {
    memory: {} as Record<string, { due: number }>,
    todos: [] as { id: string; text: string; done: boolean }[],
  },
  listeners: new Set<() => void>(),
}));

vi.mock('./store', () => ({
  useData: {
    getState: () => h.state,
    subscribe: (fn: () => void) => {
      h.listeners.add(fn);
      return () => h.listeners.delete(fn);
    },
  },
  dueCount: (m: Record<string, { due: number }>) => Object.values(m).filter((x) => x.due <= 0).length,
}));

vi.mock('../modules/noto-widgets', () => ({
  isSupported: vi.fn(() => true),
  setSnapshot: vi.fn(),
  startReview: vi.fn(() => 'activity-id'),
  updateReview: vi.fn(),
  endReview: vi.fn(),
}));

import * as Widgets from '../modules/noto-widgets';
import {
  buildSnapshot,
  initWidgetSync,
  startReviewActivity,
  updateReviewActivity,
  endReviewActivity,
} from './widgetSync';

const notify = () => h.listeners.forEach((fn) => fn());

beforeEach(() => {
  h.state.memory = {};
  h.state.todos = [];
  h.listeners.clear();
  vi.clearAllMocks();
  vi.mocked(Widgets.isSupported).mockReturnValue(true);
});

describe('noto → widget snapshot', () => {
  it('maps due notes, open todos, and a daily quote', () => {
    h.state.memory = { a: { due: -2 }, b: { due: 0 }, c: { due: 3 } };
    h.state.todos = [
      { id: '1', text: 'Draft the Q3 memo', done: false },
      { id: '2', text: 'Reply to Lena', done: false },
      { id: '3', text: 'Re-read FSRS', done: true },
      { id: '4', text: 'Book flights', done: false },
      { id: '5', text: 'Water plants', done: false },
    ];
    const snap = buildSnapshot();
    expect(snap.reviewsDue).toBe(2); // due <= 0 → a, b
    expect(snap.todosOpen).toBe(4);
    expect(snap.todos).toEqual(['Draft the Q3 memo', 'Reply to Lena', 'Book flights']); // top 3 open
    expect(snap.doneToday).toBe(1);
    expect(snap.totalToday).toBe(5);
    expect(snap.nextLabel).toBe('2 waiting');
    expect(snap.quote.length).toBeGreaterThan(0);
    expect(snap.quoteAuthor.length).toBeGreaterThan(0);
  });

  it('says "all caught up" when nothing is due', () => {
    h.state.memory = { a: { due: 4 } };
    const snap = buildSnapshot();
    expect(snap.reviewsDue).toBe(0);
    expect(snap.nextLabel).toBe('all caught up');
  });
});

describe('bridge sync (store → widgets)', () => {
  it('pushes an initial snapshot, then only on a real change', () => {
    h.state.memory = { a: { due: -1 } };
    const stop = initWidgetSync();
    expect(Widgets.setSnapshot).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Widgets.setSnapshot).mock.calls[0][0]).toMatchObject({ reviewsDue: 1 });

    notify(); // nothing changed → deduped
    expect(Widgets.setSnapshot).toHaveBeenCalledTimes(1);

    h.state.memory = { a: { due: -1 }, b: { due: -1 } };
    notify(); // real change → one more push
    expect(Widgets.setSnapshot).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Widgets.setSnapshot).mock.calls[1][0]).toMatchObject({ reviewsDue: 2 });

    stop();
    notify(); // unsubscribed
    expect(Widgets.setSnapshot).toHaveBeenCalledTimes(2);
  });

  it('no-ops when the native bridge is absent', () => {
    vi.mocked(Widgets.isSupported).mockReturnValue(false);
    initWidgetSync()();
    expect(Widgets.setSnapshot).not.toHaveBeenCalled();
  });
});

describe('review Live Activity lifecycle', () => {
  it('starts, updates, and ends with the right counts', () => {
    startReviewActivity(5);
    expect(Widgets.startReview).toHaveBeenCalledTimes(1);
    const [total, remaining, quote] = vi.mocked(Widgets.startReview).mock.calls[0];
    expect(total).toBe(5);
    expect(remaining).toBe(5);
    expect(typeof quote).toBe('string');

    updateReviewActivity(3, 5);
    expect(Widgets.updateReview).toHaveBeenCalledWith(3, 5, expect.any(String), expect.any(Number));

    endReviewActivity();
    expect(Widgets.endReview).toHaveBeenCalledTimes(1);
  });

  it('does not start an activity for an empty queue', () => {
    startReviewActivity(0);
    expect(Widgets.startReview).not.toHaveBeenCalled();
  });

  it('no-ops the whole lifecycle without the native bridge', () => {
    vi.mocked(Widgets.isSupported).mockReturnValue(false);
    startReviewActivity(5);
    updateReviewActivity(3, 5);
    endReviewActivity();
    expect(Widgets.startReview).not.toHaveBeenCalled();
    expect(Widgets.updateReview).not.toHaveBeenCalled();
    expect(Widgets.endReview).not.toHaveBeenCalled();
  });
});
