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
  'Which idea from this week deserves a second look?',
  'What did you almost give up on today?',
  'What surprised you — and why did it?',
  'If today had a title, what would it be?',
]
