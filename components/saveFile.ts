import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Native (Android and iOS): write to cache, then open the share sheet so the file can be saved or sent.
export async function saveFile(name: string, text: string) {
  const uri = (FileSystem.cacheDirectory ?? '') + name;
  await FileSystem.writeAsStringAsync(uri, text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: 'Export IFC', UTI: 'public.data' });
}
