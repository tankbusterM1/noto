import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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
