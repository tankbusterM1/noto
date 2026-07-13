/*
 * Notification copy — the app's "voice" when it nudges you back. Pure + shared,
 * so it's testable and the same on both platforms. Three personalities:
 *
 *   · normal   — calm, warm, ink-and-paper. Nudges only when something waits.
 *   · high     — a coach. More often, streak-focused, punchy.
 *   · obsessed — unhinged and persistent, guilt-trips you into your reviews.
 *
 * Lines are templates over {name} {n} {due} {todos} {streak}; a line that
 * mentions a count is only used when something is actually pending. Title × body
 * combinations give well over a hundred distinct notifications per mode.
 */

export type NotifyMode = 'off' | 'normal' | 'high' | 'obsessed';
export const NOTIFY_MODES: NotifyMode[] = ['off', 'normal', 'high', 'obsessed'];

export interface NotifyCtx {
  /** What the user set in settings, or '' (falls back to a friendly stand-in). */
  name: string;
  /** Notes/cards due for review. */
  due: number;
  /** Open todos. */
  todos: number;
  /** Current study streak in days. */
  streak: number;
}

export interface NotifyModeInfo {
  key: NotifyMode;
  label: string;
  blurb: string;
}

export const NOTIFY_MODE_INFO: NotifyModeInfo[] = [
  { key: 'off', label: 'Off', blurb: 'No reminders. Silence.' },
  { key: 'normal', label: 'Normal', blurb: 'One calm daily nudge — only when something is waiting.' },
  { key: 'high', label: 'High', blurb: 'A coach in your pocket — several a day, spread across your active hours, streak-focused.' },
  { key: 'obsessed', label: 'Obsessed', blurb: "Unhinged. It will not stop until your reviews and todos are done. You asked for this." },
];

/** How many times a day each mode fires, and at roughly which hours. */
export const NOTIFY_HOURS: Record<Exclude<NotifyMode, 'off'>, number[]> = {
  normal: [9],
  high: [9, 13, 17, 20],
  obsessed: [8, 11, 13, 15, 18, 20, 22],
};

const TITLES: Record<Exclude<NotifyMode, 'off'>, string[]> = {
  normal: ['Noto', 'A gentle nudge', 'Your deck', 'Time to review', 'Still here'],
  high: ["Come on!", "Don't break the chain", "Let's go", 'Tap in', 'Streak check'],
  obsessed: ['GET UP', 'REVIEW. NOW.', 'Hey. HEY.', "I'm not kidding", "It's time", 'This again'],
};

const NORMAL: string[] = [
  "Your ink is drying, {name}. A quick review keeps it dark.",
  "{n} small things are waiting, {name}. Two minutes?",
  "A review now costs less than relearning later, {name}.",
  "Morning, {name}. Nothing urgent — just a gentle nudge.",
  "{due} to review, {name}. They fade if you leave them.",
  "Your streak is at {streak}, {name}. Keep the candle lit?",
  "{name}, your notes miss you.",
  "A calm minute with your deck, {name}?",
  "{todos} on your list, {name}. One at a time.",
  "The notes you never review are the ones you quietly lose, {name}.",
  "Pick up where you left off, {name}?",
  "{n} waiting. No rush, {name} — whenever you're ready.",
  "Little and often beats a cram, {name}.",
  "{name}, five minutes now saves an hour later.",
  "Your memory's asking for a top-up, {name}.",
  "Time to water the garden, {name}. {n} things need you.",
  "{due} due today, {name}. Reviewing now is the easy version.",
  "A quiet check-in, {name}. What's fading?",
  "Keep the ink dark, {name} — a short review does it.",
  "{name}, your future self says thanks for reviewing today.",
  "Small step, {name}: clear {n} and you're done.",
  "Your deck is ready when you are, {name}.",
  "Don't let today's notes cool off, {name}.",
  "{name}, a two-minute review keeps the streak at {streak}.",
  "Gentle reminder: {n} things when you get a sec, {name}.",
  "The best time to review was yesterday; the second best is now, {name}.",
  "{name}, a little study now, a lot less stress later.",
  "Your notes are ripe for a review, {name}.",
  "Nothing's on fire, {name}. Just {n} things drifting.",
  "Come drift through a few, {name}.",
  "{name}, keep the thread going — {streak} days and counting.",
  "A short session, {name}? Your brain will thank you.",
  "{due} concepts fading, {name}. A glance revives them.",
  "Whenever you're ready, {name} — {n} things wait patiently.",
  "Tend to the deck, {name}. It's how the streak survives.",
];

const HIGH: string[] = [
  "Come on {name}, don't break the chain. {streak} days!",
  "{name}, {n} things are stacking up. Knock them out.",
  "Your streak's on the line, {name}. {due} reviews. Go.",
  "No excuses, {name} — {n} things, five minutes.",
  "{name}, the deck's not going to review itself.",
  "Chain at {streak}, {name}. Protect it.",
  "Quick, {name} — {due} due before the day slips.",
  "{name}, momentum loves you. Keep going.",
  "Tap in, {name}. {n} waiting.",
  "Streak {streak} and climbing, {name}. Don't blink.",
  "{name}, discipline now, ease later. {n} things.",
  "Reviews open, {name}. Close them.",
  "{name}, you've got {todos} todos judging you. Handle it.",
  "Don't ghost your deck, {name}. {due} to review.",
  "{name}, 300 seconds. That's all. Go.",
  "Streak check, {name}: {streak} days. Keep it alive.",
  "{n} things, {name}. You've done more with less time.",
  "Move, {name} — {due} reviews aren't getting fresher.",
  "{name}, the grind respects consistency. Show up.",
  "Your brain's warm, {name}. Strike now — {n} waiting.",
  "{name}, {todos} on the list. Cross one off. Then another.",
  "Don't let {streak} days go to waste, {name}.",
  "Reviews due, {name}. This is the easy part.",
  "{name}, small reps, big brain. {n} things.",
  "Clock's ticking, {name}. {due} to review today.",
  "Show up for yourself, {name}. {n} things, right now.",
  "{name}, the streak is a promise. Keep it — {streak} days.",
  "Get it done, {name}. {n} things between you and clear.",
  "{name}, future-you is watching. {due} reviews.",
  "Consistency is the cheat code, {name}. Tap in.",
  "{name}, {n} waiting and rising. Don't let them pile.",
  "Lock in, {name}. Five minutes. {due} reviews.",
  "{name}, streaks don't build themselves. {streak} and counting.",
  "Reviews. Now. {name}. You'll feel great after.",
  "{name}, {todos} todos and {due} reviews. One sweep, done.",
];

const OBSESSED: string[] = [
  "GET UP {name}. {n} things. They're not doing themselves.",
  "I SEE you scrolling, {name}. {due} reviews. NOW.",
  "{name}. {name}. {name}. The reviews. Do them.",
  "You said you'd study, {name}. {n} things. I remember EVERYTHING.",
  "Put the phone down and pick it back up for REVIEWS, {name}.",
  "{name}, {streak} days and you're about to fumble it. UNACCEPTABLE.",
  "Your todos are haunting me, {name}. {todos} of them. Make it stop.",
  "Don't make me come over there, {name}. {due} reviews.",
  "{name} I am BEGGING. {n} things. Five minutes. PLEASE.",
  "Sleep? No. {due} reviews first, {name}.",
  "{name}, the deck knows your name and it is DISAPPOINTED.",
  "Every second you ignore this, {name}, a note forgets you.",
  "{n} things, {name}. I will not stop. I cannot stop.",
  "Reviews are due and I'm feeling UNHINGED about it, {name}.",
  "{name}. Streak {streak}. Don't you dare. (I'll be back regardless.)",
  "Hey. HEY. {name}. {due} reviews. Look at me.",
  "{name}, your todos filed a complaint. {todos} pending. Address it.",
  "I've prepared a list, {name}. It's {n} items long. We're doing all of them.",
  "Studying builds character, {name}. So does fear. {n} things.",
  "{name}, drop everything. This is a REVIEW EMERGENCY. {due} due.",
  "No because why are there STILL {todos} todos, {name}??",
  "{name} I skipped my nap for this. {n} reviews. Let's GO.",
  "Your future self called, {name}. They're mad. {due} reviews.",
  "{name}, consistency or chaos. Chaos until you review. {n} waiting.",
  "It's giving procrastination, {name}. {n} things. Fix it.",
  "{name}, the streak is {streak} and I have TRUST ISSUES. Prove me wrong.",
  "Reviews. Reviews. REVIEWS. {name}. {due} of them.",
  "I'm in your notifications AND your head now, {name}. {n} things.",
  "{name}, you have {todos} todos and one very persistent app.",
  "Do NOT test me, {name}. {due} reviews. I have all day.",
  "{name}, I'll keep buzzing until the {n} things are done. Try me.",
  "Blink twice if you'll review, {name}. Actually just review. {due} due.",
  "{name} the audacity to have {n} pending and open something else.",
  "Rise and REVIEW, {name}. {due} of them. This is not a drill.",
  "{name}, I'm doing this because I care. {n} things. GO.",
  "Your deck misses you SO bad it's acting out, {name}. {due} reviews.",
  "Streak {streak}, {name}. I've invested too much in you. DON'T.",
  "{name} we are NOT losing the streak on my watch. {n} things.",
  "What has {n} pending items and refuses to shut up? Me. Review, {name}.",
  "{name}. Final warning. (There will be more warnings.) {due} reviews.",
];

const POOL: Record<Exclude<NotifyMode, 'off'>, string[]> = { normal: NORMAL, high: HIGH, obsessed: OBSESSED };

/** Total distinct lines shipped (for the settings/test copy). */
export function variationCount(): number {
  return NORMAL.length + HIGH.length + OBSESSED.length;
}

const COUNT_RE = /\{n\}|\{due\}|\{todos\}/;

function fill(s: string, ctx: NotifyCtx, name: string): string {
  return s
    .replace(/\{name\}/g, name)
    .replace(/\{n\}/g, String(ctx.due + ctx.todos))
    .replace(/\{due\}/g, String(ctx.due))
    .replace(/\{todos\}/g, String(ctx.todos))
    .replace(/\{streak\}/g, String(ctx.streak));
}

/**
 * Compose a notification for the mode + context. `seed` makes it deterministic
 * (pass a slot index or a day number). Lines that mention a count are skipped
 * when nothing is pending, so it never says "0 reviews".
 */
export function composeNotify(mode: Exclude<NotifyMode, 'off'>, ctx: NotifyCtx, seed: number): { title: string; body: string } {
  const name = ctx.name.trim() || 'you';
  const pending = ctx.due + ctx.todos;
  const lines = POOL[mode];
  const usable = pending > 0 ? lines : lines.filter((l) => !COUNT_RE.test(l));
  const bodyPool = usable.length ? usable : lines;
  const s = Math.abs(Math.floor(seed));
  const body = fill(bodyPool[s % bodyPool.length], ctx, name);
  const titles = TITLES[mode];
  const title = fill(titles[(s * 7 + 3) % titles.length], ctx, name);
  return { title, body };
}
