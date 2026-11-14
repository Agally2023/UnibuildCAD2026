import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Deletes a project and everything in it (elements, storeys, library items, snapshots go with it), plus the designs kept on this device.
// Returns null on success, or a message to show.
export async function deleteProject(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
  if (error) return error.message;
  if (!data?.length) return 'Could not delete: only the owner of a project can delete it.';
  try {
    await AsyncStorage.removeItem(`unibuild.parts.${id}`);
    if ((await AsyncStorage.getItem('unibuild.lastProject')) === id) await AsyncStorage.removeItem('unibuild.lastProject');
  } catch { /* nothing kept on this device */ }
  return null;
}
