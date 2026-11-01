import AsyncStorage from '@react-native-async-storage/async-storage';

// Opening behaviour: after sign-in the app goes straight to the Plan of the last project used (or the newest one).
// The jump happens once per sign-in, so choosing "All projects" afterwards stays on the project list.
const KEY = 'unibuild.lastProject';
export const session = { autoOpened: false };
export const rememberProject = (id: string) => { AsyncStorage.setItem(KEY, id).catch(() => {}); };
export const lastProject = async (): Promise<string | null> => { try { return await AsyncStorage.getItem(KEY); } catch { return null; } };
