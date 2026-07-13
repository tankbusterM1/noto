import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notify } from '../core';

// Show banners even when the app is foregrounded — so the settings "test" fires
// are actually visible, not silently swallowed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/*
 * The home-screen signal, without a widget.
 *
 * A real WidgetKit widget can only read the app's data through an App Group,
 * and Apple's supported-capabilities reference is explicit that a free personal
 * team cannot use App Groups (nor push, iCloud, or associated domains). So a
 * todos widget is gated behind the $99 Developer Program — full stop.
 *
 * These two things are NOT gated, need no entitlement, and cover most of the
 * intent ("what am I missing?"):
 *
 *   · the app-icon BADGE carries the open-todo count, always visible;
 *   · a daily LOCAL notification names what's waiting.
 *
 * Local notifications are unrelated to push: no APNs certificate, no paid
 * account. Everything below degrades to a no-op if permission is refused, so
 * the app never breaks over a denied prompt.
 */

const DIGEST_ID = 'noto.daily.digest';

let granted: boolean | null = null;

/** Ask once, remember the answer. Safe to call repeatedly. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (granted !== null) return granted;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return (granted = true);
    // Don't re-prompt if the user already said no; iOS ignores it anyway.
    if (!current.canAskAgain) return (granted = false);

    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: false },
    });
    return (granted = res.granted);
  } catch {
    return (granted = false);
  }
}

/** Open-todo count on the app icon. No-op without permission. */
export async function syncBadge(openTodos: number): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, openTodos));
  } catch {
    /* badge unsupported — ignore */
  }
}

export async function cancelDigest(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(DIGEST_ID);
  } catch {
    /* nothing scheduled */
  }
}

/**
 * A daily reminder naming what's waiting. The body is baked in at schedule time,
 * so we re-schedule whenever the counts change — otherwise tomorrow's alert
 * would quote today's numbers.
 */
export async function scheduleDigest(openTodos: number, dueNotes: number, hour = 9, minute = 0): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await ensureNotificationPermission())) return;

  await cancelDigest();
  if (openTodos === 0 && dueNotes === 0) return; // nothing worth interrupting for

  const parts: string[] = [];
  if (openTodos) parts.push(`${openTodos} todo${openTodos === 1 ? '' : 's'} open`);
  if (dueNotes) parts.push(`${dueNotes} note${dueNotes === 1 ? '' : 's'} due`);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DIGEST_ID,
      content: {
        title: 'Noto',
        body: parts.join(' · '),
        badge: openTodos,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {
    /* scheduling refused — ignore */
  }
}

// ── the creative nudge system (name + modes) ─────────────────────────────
const NUDGE_PREFIX = 'noto.nudge.';
const MAX_NUDGES = 8;

export async function cancelNudges(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    for (let i = 0; i < MAX_NUDGES; i++) await Notifications.cancelScheduledNotificationAsync(NUDGE_PREFIX + i);
  } catch {
    /* nothing scheduled */
  }
}

/**
 * Schedule the day's nudges for the chosen mode, worded by the copy engine.
 * normal fires once and only when something waits; high a few times; obsessed
 * many times across the day. Re-schedule whenever the counts change (the body is
 * baked in at schedule time). `seed` (a day number) varies the copy day to day.
 */
export async function scheduleNudges(mode: notify.NotifyMode, ctx: notify.NotifyCtx, seed: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelNudges();
  if (mode === 'off') return;
  if (!(await ensureNotificationPermission())) return;

  if (mode === 'normal' && ctx.due + ctx.todos === 0) return; // polite: nothing to interrupt for

  const hours = notify.NOTIFY_HOURS[mode];
  try {
    for (let i = 0; i < hours.length; i++) {
      const { title, body } = notify.composeNotify(mode, ctx, seed + i * 101);
      await Notifications.scheduleNotificationAsync({
        identifier: NUDGE_PREFIX + i,
        content: { title, body, badge: ctx.todos },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: hours[i], minute: (i * 17) % 60 },
      });
    }
  } catch {
    /* scheduling refused — ignore */
  }
}

/** Fire one sample notification of a mode ~2s from now — for the settings test panel. */
export async function fireTestNotify(mode: Exclude<notify.NotifyMode, 'off'>, ctx: notify.NotifyCtx, seed: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!(await ensureNotificationPermission())) return false;
  const { title, body } = notify.composeNotify(mode, ctx, seed);
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, badge: ctx.todos },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false },
    });
    return true;
  } catch {
    return false;
  }
}
