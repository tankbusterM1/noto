/* Static app constants ported from the prototype. */

/** Code-block language cycle (click the language chip to advance). */
export const LANGS = [
  'python',
  'sql',
  'rust',
  'go',
  'typescript',
  'c',
  'bash',
] as const

/** Rotating journal prompts (chosen by day-of-month). */
export const PROMPTS = [
  'What did you figure out today that yesterday-you did not know?',
  'What confused you today — and what would unconfuse it?',
  'What would you tell yourself from this morning?',
]

/** Extra month-planner items keyed by day-of-month (demo content). */
export const MONTH_EXTRA: Record<number, string> = {
  8: 'Paper club',
  15: 'OS midterm',
  21: 'Ship demo day',
  26: 'Backups + clean setup',
}
