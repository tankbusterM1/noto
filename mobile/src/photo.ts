import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/*
 * Pick a photo from the library and return it as a compressed JPEG data-URL,
 * ready to drop into a note body as `![image](<dataURL>)`.
 *
 * The image is downscaled + recompressed FIRST: the base64 lives inline in the
 * note's markdown, which is synced verbatim to the vault and rendered by the PC
 * app, so a full-res phone photo would bloat every sync and lag the editor. A
 * 1280px-wide JPEG at 0.6 quality is a few hundred KB — plenty for a note.
 *
 * Returns null if permission is denied or the user cancels.
 */
const MAX_WIDTH = 1280;

export async function pickPhotoDataUrl(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Photo access needed',
      'Enable photo access for Noto in Settings to add images to a note.',
    );
    return null;
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1, // recompressed below, so grab full quality from the picker
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  // Only downscale (never upscale): clamp to MAX_WIDTH, keep smaller photos as-is.
  const width = Math.min(asset.width || MAX_WIDTH, MAX_WIDTH);
  const out = await manipulateAsync(asset.uri, [{ resize: { width } }], {
    compress: 0.6,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) return null;
  return `data:image/jpeg;base64,${out.base64}`;
}
