import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// Let the user choose a text file (IFC) and return its contents. Works on Android, iOS and web.
export async function pickText(): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const text = Platform.OS === 'web' ? await (await fetch(a.uri)).text() : await FileSystem.readAsStringAsync(a.uri);
  return { name: a.name, text };
}
