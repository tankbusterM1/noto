import type { TextStyle } from 'react-native';
import { MONO, MONO_BOLD, SERIF, SERIF_BOLD, SERIF_ITALIC, SERIF_MED } from './fonts';

/**
 * iOS design tokens.
 *
 * The type scale is Apple's Dynamic Type default point sizes (HIG "Typography"):
 * Large Title 34 · Title1 28 · Title2 22 · Title3 20 · Headline 17 semibold ·
 * Body 17 · Callout 16 · Subhead 15 · Footnote 13 · Caption1 12 · Caption2 11.
 *
 * Colours and typefaces are the desktop vault's, not stock UIKit: we obey
 * Apple's *structure* (tab bar, large titles, safe areas, Liquid Glass) while
 * keeping Noto's *voice* (paper, ink, Newsreader, JetBrains Mono).
 */
export const c = {
  bg: '#f4f1e9',
  surface: '#faf8f2',
  surface2: '#efebdf',
  ink: '#18130a',
  ink2: '#6b6355',
  ink3: '#9a9384',
  line: '#e3ddcf',
  amber: '#b87a26',
  accent: '#35518e',
  green: '#4a7350',
  red: '#a4402f',
  /** Translucent paper for glass fallbacks. */
  glassTint: 'rgba(250,248,242,0.62)',
} as const;

const w = (weight: TextStyle['fontWeight']) => weight;

export const t = {
  largeTitle: { fontSize: 34, fontWeight: w('700'), letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: w('600') },
  title2: { fontSize: 22, fontWeight: w('600') },
  title3: { fontSize: 20, fontWeight: w('600') },
  headline: { fontSize: 17, fontWeight: w('600') },
  body: { fontSize: 17, fontWeight: w('400') },
  callout: { fontSize: 16, fontWeight: w('400') },
  subhead: { fontSize: 15, fontWeight: w('400') },
  footnote: { fontSize: 13, fontWeight: w('400') },
  caption1: { fontSize: 12, fontWeight: w('400') },
  caption2: { fontSize: 11, fontWeight: w('400') },
} satisfies Record<string, TextStyle>;

// iOS ignores fontWeight on custom families — pick the family, not the weight.
export const serif = SERIF_MED;
export const serifRegular = SERIF;
export const serifBold = SERIF_BOLD;
export const serifItalic = SERIF_ITALIC;
export const mono = MONO;
export const monoBold = MONO_BOLD;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 };

/**
 * Liquid Glass floating tab bar (iOS 26 HIG): a 62pt pill hovering FLOAT_GAP
 * above the home indicator, detached from the screen edges — not the old
 * edge-to-edge 49pt bar. Content scrolls behind it.
 */
export const TAB_BAR_HEIGHT = 62;
export const FLOAT_GAP = 8;

/**
 * Noto's signature: a note's ink fades as its memory decays, and re-inks on
 * review. `recall` is the FSRS retrievability (0..1); null = never reviewed.
 */
export function inkOpacity(recall: number | null): number {
  if (recall === null) return 1;
  return 0.42 + 0.58 * Math.max(0, Math.min(1, recall));
}
