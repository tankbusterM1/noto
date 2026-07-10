import { useFonts } from 'expo-font';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';

/*
 * The desktop vault's actual typefaces — Newsreader for prose, JetBrains Mono
 * for the machine voice. Georgia/Menlo were placeholders and made the app feel
 * like a different product.
 *
 * NB: with custom families, iOS ignores `fontWeight`. You must select the family
 * for the weight you want, so we expose one constant per weight.
 */
export const SERIF = 'Newsreader_400Regular';
export const SERIF_MED = 'Newsreader_500Medium';
export const SERIF_BOLD = 'Newsreader_600SemiBold';
export const SERIF_ITALIC = 'Newsreader_400Regular_Italic';
export const MONO = 'JetBrainsMono_400Regular';
export const MONO_BOLD = 'JetBrainsMono_600SemiBold';

/** Returns true once fonts are ready — or if they failed, so we never hard-block. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });
  return loaded || !!error;
}
